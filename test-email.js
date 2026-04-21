// Quick SES test — run with: node test-email.js
// Set env vars before running:
//   AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... node test-email.js

import { SESClient, SendRawEmailCommand } from '@aws-sdk/client-ses';

const ses = new SESClient({
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const rawMessage = [
  'From: Cortex <john.sathya@zeb.co>',
  'To: Sivasaran.Sekaran@zeb.co',
  'Subject: Cortex Mail Service — Test Email',
  'MIME-Version: 1.0',
  'Content-Type: text/html; charset=UTF-8',
  '',
  '<div style="font-family:sans-serif;padding:32px;background:#1a1d2e;color:#e2e8f0">',
  '<h2 style="color:#c4e04e">Cortex Mail Service</h2>',
  '<p>Test email from the Cortex platform — AWS SES us-east-1</p>',
  '</div>',
].join('\r\n');

const result = await ses.send(new SendRawEmailCommand({
  RawMessage: { Data: Buffer.from(rawMessage) },
}));

console.log('✓ Sent — MessageId:', result.MessageId);
