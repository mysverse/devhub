import { NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/prisma';

export async function POST(req: Request) {
  const signature = req.headers.get('linear-signature');
  const body = await req.text();
  
  // Verify Webhook Signature (if LINEAR_WEBHOOK_SECRET is set)
  const webhookSecret = process.env.LINEAR_WEBHOOK_SECRET;
  if (webhookSecret && signature) {
    const expectedSignature = crypto.createHmac('sha256', webhookSecret).update(body).digest('hex');
    if (signature !== expectedSignature) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }
  }

  const payload = JSON.parse(body);

  // We only care about Issue updates
  if (payload.action === 'update' && payload.type === 'Issue') {
    const issueData = payload.data;
    
    // Check if it's marked as done. Let's assume state name "Done" or state.type "completed"
    if (issueData.state?.type === 'completed') {
      
      let bountyAmount = 0;
      
      if (issueData.estimate) {
         bountyAmount = issueData.estimate * 10; // e.g. 1 point = $10
      }
      
      const assigneeEmail = issueData.assignee?.email;
      
      if (bountyAmount > 0 && assigneeEmail) {
        console.log(`Bounty of ${bountyAmount} for issue ${issueData.id} completed by ${assigneeEmail}`);
      }
    }
  }

  return NextResponse.json({ success: true });
}