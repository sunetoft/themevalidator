export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const dns = await import('dns');
    dns.setDefaultResultOrder('ipv4first');
    console.log('[instrumentation] DNS result order set to ipv4first');
  }
}
