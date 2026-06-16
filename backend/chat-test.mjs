const BASE = 'http://localhost:3000';
const token = await (await fetch(`${BASE}/auth/verify-otp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone: '+910000000001', code: '123456' }) })).json().then((d) => d.token);

const message = process.argv[2] || 'Find me a sci-fi movie with an evening show near Koramangala, hold 2 recliner seats, apply promo WELCOME10, then book it and pay with the test card.';
const sessionId = process.argv[3];

console.log('USER:', message, '\n');
const r = await fetch(`${BASE}/chat/sync`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ message, sessionId }) });
const data = await r.json();

console.log('--- agent actions (in order) ---');
for (const { event, data: d } of data.events) {
  if (event === 'tool') console.log(`  ${d.agent === 'booking' ? '↳ [sub-agent]' : '•'} ${d.name}(${JSON.stringify(d.args)})`);
  else if (event === 'delegate') console.log(`  ⇒ DELEGATE to booking sub-agent: "${d.goal}"`);
  else if (event === 'delegate_done') console.log(`  ⇐ sub-agent returned`);
}
console.log('\n--- final session state ---');
console.log(JSON.stringify(data.state, null, 2));
console.log('\nASSISTANT:', data.reply);
console.log('\nsessionId:', data.sessionId);
