import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

function normalizeRepoUrl(url) {
  if (!url) return '';
  return url
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^git@github\.com:/, 'github.com/')
    .replace(/\.git$/, '')
    .trim();
}

export async function GET(request) {
  const host = request.headers.get('host') || 'localhost:3000';
  const protocol = request.headers.get('x-forwarded-proto') || 'http';
  const webhookUrl = `${protocol}://${host}/api/webhooks/github`;

  return NextResponse.json({
    status: 'ACTIVE',
    webhookUrl,
    instructions: 'Configure this URL in your GitHub Repository -> Settings -> Webhooks. Select Content-Type: application/json and Trigger: Just the push event.'
  });
}

export async function POST(request) {
  try {
    const event = request.headers.get('x-github-event') || 'push';
    
    // We handle 'push' events
    if (event !== 'push') {
      return NextResponse.json({ message: `Ignored event '${event}'` }, { status: 200 });
    }

    const rawBody = await request.text();

    // Optional X-Hub-Signature-256 HMAC validation if WEBHOOK_SECRET is set
    const signature = request.headers.get('x-hub-signature-256');
    const secret = process.env.WEBHOOK_SECRET;
    if (secret && signature) {
      const expectedSig = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
      if (signature !== expectedSig) {
        return NextResponse.json({ error: 'Assinatura X-Hub-Signature-256 inválida' }, { status: 401 });
      }
    }

    const payload = JSON.parse(rawBody);
    const repoCloneUrl = payload?.repository?.clone_url || '';
    const repoHtmlUrl = payload?.repository?.html_url || '';
    const ref = payload?.ref || 'refs/heads/main';
    const branch = ref.replace('refs/heads/', '');

    const commitMsg = payload?.head_commit?.message || `Git Push on ${branch}`;
    const commitAuthor = payload?.head_commit?.author?.name || payload?.pusher?.name || 'GitHub';
    const commitSha = (payload?.head_commit?.id || '').substring(0, 7);

    const normClone = normalizeRepoUrl(repoCloneUrl);
    const normHtml = normalizeRepoUrl(repoHtmlUrl);

    // Find all projects in database
    const allProjects = await prisma.project.findMany();

    // Match project by repo URL and branch
    const matchedProject = allProjects.find(p => {
      const normProjectRepo = normalizeRepoUrl(p.repoUrl);
      const isRepoMatch = normProjectRepo === normClone || normProjectRepo === normHtml || (normClone && normProjectRepo.includes(normClone));
      const isBranchMatch = p.branch.toLowerCase() === branch.toLowerCase();
      return isRepoMatch && isBranchMatch;
    });

    if (!matchedProject) {
      return NextResponse.json({
        message: 'No matching project found for this repository and branch',
        receivedRepo: repoHtmlUrl || repoCloneUrl,
        receivedBranch: branch
      }, { status: 200 });
    }

    // Create a new PENDING build for the matched project
    const build = await prisma.build.create({
      data: {
        projectId: matchedProject.id,
        status: 'PENDING',
        commit: `${commitMsg} (${commitSha}) by ${commitAuthor}`,
        machine: 'Mac mini (Intel Core i5)'
      }
    });

    console.log(`🐙 GitHub Webhook triggered build ${build.id} for project "${matchedProject.name}"`);

    return NextResponse.json({
      message: `Build queued successfully for project "${matchedProject.name}"`,
      buildId: build.id,
      project: matchedProject.name,
      branch
    }, { status: 201 });

  } catch (error) {
    console.error('Webhook processing error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
