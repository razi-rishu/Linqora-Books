/** True for the e-mail links Supabase Auth sends back (deep link on a phone, ?code= in a browser). */
export function isAuthCallbackUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      (u.protocol === 'com.linqora.books:' && url.includes('auth/callback')) ||
      u.searchParams.has('code') ||
      u.searchParams.has('error_description')
    );
  } catch {
    return false;
  }
}
