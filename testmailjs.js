// Quick SES test — run with:
//   AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... node testmailjs.js
import { SESClient, SendRawEmailCommand } from '@aws-sdk/client-ses';

const ses = new SESClient({
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const rawMessage = [
  'From: Dharshan.Raja@zeb.co',
  'To: John.Sathya@zeb.co',
  'Subject: Hi Dharshan',
  'MIME-Version: 1.0',
  'Content-Type: text/html; charset=UTF-8',
  '',
  '<div style="font-family:sans-serif;padding:32px;background:#1a1d2e;color:#e2e8f0">',
  '<h2 style="color:#c4e04e">Hi John</h2>',
  '<p>How are u ?</p>',
  '</div>',
].join('\r\n');

const result = await ses.send(new SendRawEmailCommand({
  RawMessage: { Data: Buffer.from(rawMessage) },
}));

console.log('✓ Sent — MessageId:', result.MessageId);