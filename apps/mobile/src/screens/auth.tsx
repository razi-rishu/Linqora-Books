import { useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChartColumn, FileText, ShieldCheck, Info, MailCheck, Loader2, TriangleAlert, KeyRound } from 'lucide-react';
import { BrandMark, TestModeBanner } from '@/components/common';
import { Button, ButtonLink } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { AuthError as LocalAuthError, useSession } from '@/state/session';
import { useSubscription } from '@/state/subscription';
import { useBooksQuery } from '@/data/books';
import { DATA_MODE } from '@/config/env';
import { getAuthService, useAuth, useAuthReady, useCurrentUser } from '@/auth/auth-store';
import { AuthError } from '@/auth/auth-service';

const CLOUD = DATA_MODE === 'cloud';

/** Decides where a signed-in user belongs in the onboarding flow. */
function useNextOnboardingRoute(): string | null {
  const ready = useAuthReady();
  const user = useCurrentUser();
  const recovery = useAuth((s) => s.recovery);
  const introSeen = useSubscription((s) => s.introSeen);
  const { data, isLoading, isError } = useBooksQuery();
  if (DATA_MODE === 'unconfigured') return '/not-configured';
  if (!ready) return null;
  if (!user) return '/welcome';
  if (recovery) return '/reset-password';
  if (isLoading) return null;
  if (isError) return '/app'; // the shell shows the connection problem and retries
  // Billing is disabled in the cloud build, so there is no subscription intro to show.
  if (!CLOUD && !introSeen) return '/subscribe';
  if (!data) return '/setup';
  return '/app';
}

export function SplashScreen() {
  const navigate = useNavigate();
  const next = useNextOnboardingRoute();
  useEffect(() => {
    if (!next) return;
    const timer = setTimeout(() => navigate(next, { replace: true }), CLOUD ? 0 : 900);
    return () => clearTimeout(timer);
  }, [navigate, next]);
  return (
    <div className="grid min-h-dvh place-items-center bg-primary text-primary-foreground">
      <div className="flex flex-col items-center gap-3 animate-pulse">
        <svg viewBox="0 0 64 64" className="size-20" aria-hidden="true">
          <rect width="64" height="64" rx="14" fill="currentColor" opacity="0.12" />
          <path d="M18 16h8v26h20v8H18z" fill="currentColor" />
          <circle cx="44" cy="22" r="6" fill="#a5b4fc" />
        </svg>
        <p className="text-2xl font-semibold tracking-tight">Linqora Books</p>
        <p className="text-sm opacity-80">Clear books for growing businesses</p>
      </div>
    </div>
  );
}

function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="pt-safe bg-warning-soft">
        <TestModeBanner />
      </div>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 py-8">
        <BrandMark className="mb-8" />
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        <div className="mt-6">{children}</div>
        {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
      </div>
    </div>
  );
}

function PrototypeAuthNotice() {
  if (CLOUD) return null;
  return (
    <div className="mb-5 flex gap-2 rounded-xl border bg-muted p-3 text-xs text-muted-foreground">
      <Info className="size-4 shrink-0" aria-hidden="true" />
      <p>
        Local preview: no real account is created and your password is not stored or sent anywhere. This build is not
        connected to Linqora Books cloud accounts.
      </p>
    </div>
  );
}

function Notice() {
  const notice = useAuth((s) => s.notice);
  const set = useAuth((s) => s.set);
  if (!notice) return null;
  return (
    <div role="status" className="mb-5 flex items-start justify-between gap-2 rounded-xl bg-primary-soft p-3 text-sm text-primary">
      <span>{notice}</span>
      <button type="button" className="text-xs underline" onClick={() => set({ notice: null })}>
        Dismiss
      </button>
    </div>
  );
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-xl bg-negative-soft p-3 text-sm text-negative">
      {message}
    </p>
  );
}

export function WelcomeScreen() {
  const features = [
    { icon: ChartColumn, title: 'Know your profit', text: 'Sales, expenses and profit — separated from cash in and out.' },
    { icon: FileText, title: 'Quotes to invoices', text: 'Turn accepted quotations into invoices and track payments.' },
    { icon: ShieldCheck, title: 'Records you can trust', text: 'Nothing is silently deleted. Corrections leave a trail.' },
  ];
  return (
    <AuthLayout title="Simple books for small businesses" subtitle="For shops, event companies, garages, freelancers, contractors and more.">
      <Notice />
      <ul className="space-y-4">
        {features.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="font-medium">{title}</p>
              <p className="text-sm text-muted-foreground">{text}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-10 space-y-3">
        <ButtonLink to="/sign-up" block size="lg">
          Create account
        </ButtonLink>
        <ButtonLink to="/sign-in" block size="lg" variant="outline">
          I already have an account
        </ButtonLink>
      </div>
      <p className="mt-6 text-center text-xs text-muted-foreground">
        A small-business finance tracker. Not certified tax or statutory accounting software.
      </p>
    </AuthLayout>
  );
}

const signInSchema = z.object({
  email: z.email('Enter a valid e-mail address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export function SignInScreen() {
  const navigate = useNavigate();
  const localSignIn = useSession((s) => s.signIn);
  const setAuth = useAuth((s) => s.set);
  const [error, setError] = useState<string | null>(null);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm({ resolver: zodResolver(signInSchema), defaultValues: { email: '', password: '' } });
  return (
    <AuthLayout
      title="Sign in"
      footer={
        <>
          New here?{' '}
          <Link to="/sign-up" className="font-medium text-primary">
            Create an account
          </Link>
        </>
      }
    >
      <Notice />
      <PrototypeAuthNotice />
      <form
        noValidate
        className="space-y-4"
        onSubmit={handleSubmit(async (values) => {
          setError(null);
          setUnverifiedEmail(null);
          try {
            if (CLOUD) {
              const user = await getAuthService().signIn(values.email, values.password);
              setAuth({ status: 'signed-in', user, notice: null, recovery: false });
            } else {
              localSignIn(values.email);
            }
            navigate('/', { replace: true });
          } catch (e) {
            if (e instanceof AuthError && e.code === 'not-verified') setUnverifiedEmail(values.email);
            setError(e instanceof AuthError || e instanceof LocalAuthError ? e.message : 'Sign-in failed');
          }
        })}
      >
        <Field label="E-mail" error={formState.errors.email?.message}>
          {(p) => <Input {...p} type="email" autoComplete="email" inputMode="email" {...register('email')} />}
        </Field>
        <Field label="Password" error={formState.errors.password?.message}>
          {(p) => <Input {...p} type="password" autoComplete="current-password" {...register('password')} />}
        </Field>
        <FormError message={error} />
        {unverifiedEmail && <ResendVerification email={unverifiedEmail} />}
        <Button type="submit" block size="lg" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? <Loader2 className="animate-spin" /> : null} Sign in
        </Button>
        <div className="text-center">
          <Link to="/forgot-password" className="text-sm text-primary">
            Forgot password?
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
}

function ResendVerification({ email }: { email: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  return (
    <p className="text-sm">
      {state === 'sent' ? (
        <span className="text-positive">A new verification e-mail was sent to {email}.</span>
      ) : (
        <button
          type="button"
          className="text-primary underline"
          disabled={state === 'sending'}
          onClick={async () => {
            setState('sending');
            try {
              await getAuthService().resendVerification(email);
              setState('sent');
            } catch {
              setState('error');
            }
          }}
        >
          {state === 'error' ? 'Could not send — try again' : 'Send the verification e-mail again'}
        </button>
      )}
    </p>
  );
}

const signUpSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter your name'),
    email: z.email('Enter a valid e-mail address'),
    password: z.string().min(8, 'Use at least 8 characters'),
    confirm: z.string(),
    terms: z.boolean().refine((v) => v, 'Please accept to continue'),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });

export function SignUpScreen() {
  const navigate = useNavigate();
  const localSignUp = useSession((s) => s.signUp);
  const setAuth = useAuth((s) => s.set);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: '', email: '', password: '', confirm: '', terms: false },
  });
  return (
    <AuthLayout
      title="Create your account"
      subtitle={CLOUD ? 'Your books are stored securely in the cloud and available on all your devices.' : 'Local preview account on this device.'}
      footer={
        <>
          Already registered?{' '}
          <Link to="/sign-in" className="font-medium text-primary">
            Sign in
          </Link>
        </>
      }
    >
      <PrototypeAuthNotice />
      <form
        noValidate
        className="space-y-4"
        onSubmit={handleSubmit(async (values) => {
          setError(null);
          try {
            if (CLOUD) {
              const { needsVerification } = await getAuthService().signUp(values.name, values.email, values.password);
              if (needsVerification) {
                navigate(`/verify-email?email=${encodeURIComponent(values.email)}`, { replace: true });
              } else {
                const user = await getAuthService().restore();
                setAuth({ status: 'signed-in', user });
                navigate('/', { replace: true });
              }
            } else {
              localSignUp(values.name, values.email);
              navigate('/subscribe', { replace: true });
            }
          } catch (e) {
            setError(e instanceof AuthError || e instanceof LocalAuthError ? e.message : 'Sign-up failed');
          }
        })}
      >
        <Field label="Your name" error={formState.errors.name?.message}>
          {(p) => <Input {...p} autoComplete="name" {...register('name')} />}
        </Field>
        <Field label="E-mail" error={formState.errors.email?.message} hint={CLOUD ? 'We will send you a link to verify it.' : undefined}>
          {(p) => <Input {...p} type="email" autoComplete="email" inputMode="email" {...register('email')} />}
        </Field>
        <Field label="Password" error={formState.errors.password?.message}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" {...register('password')} />}
        </Field>
        <Field label="Confirm password" error={formState.errors.confirm?.message}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" {...register('confirm')} />}
        </Field>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-0.5 size-5 accent-[var(--primary)]" {...register('terms')} />
          <span>
            {CLOUD
              ? 'I agree to the terms and privacy policy (development build — final documents will be published before launch).'
              : 'I understand this is a prototype and agree to the terms and privacy policy (to be published before launch).'}
          </span>
        </label>
        {formState.errors.terms && <p className="text-sm text-negative">{formState.errors.terms.message}</p>}
        <FormError message={error} />
        <Button type="submit" block size="lg" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? <Loader2 className="animate-spin" /> : null} Create account
        </Button>
      </form>
    </AuthLayout>
  );
}

export function VerifyEmailScreen() {
  const [params] = useSearchParams();
  const email = params.get('email') ?? '';
  return (
    <AuthLayout title="Verify your e-mail" footer={<Link to="/sign-in" className="text-primary">Back to sign in</Link>}>
      <div className="rounded-xl border bg-card p-5 text-center">
        <MailCheck className="mx-auto size-8 text-primary" aria-hidden="true" />
        <p className="mt-3 font-medium">Check your inbox</p>
        <p className="mt-1 text-sm text-muted-foreground">
          We sent a verification link to <strong>{email || 'your e-mail address'}</strong>. Open it <strong>on this phone</strong> to
          verify and sign in. If you open it elsewhere, come back and sign in here.
        </p>
      </div>
      {email && (
        <div className="mt-4 text-center">
          <ResendVerification email={email} />
        </div>
      )}
    </AuthLayout>
  );
}

const forgotSchema = z.object({ email: z.email('Enter a valid e-mail address') });

export function ForgotPasswordScreen() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm({ resolver: zodResolver(forgotSchema), defaultValues: { email: '' } });
  return (
    <AuthLayout title="Reset your password" subtitle="We'll e-mail you a link to choose a new password." footer={<Link to="/sign-in" className="text-primary">Back to sign in</Link>}>
      {sentTo ? (
        <div className="rounded-xl border bg-card p-5 text-center">
          <MailCheck className="mx-auto size-8 text-primary" aria-hidden="true" />
          <p className="mt-3 font-medium">Check your inbox</p>
          <p className="mt-1 text-sm text-muted-foreground">
            If an account exists for <strong>{sentTo}</strong>, a reset link has been sent. Open it on this phone.
          </p>
          {!CLOUD && <p className="mt-3 rounded-lg bg-warning-soft p-2 text-xs text-warning">Local preview: no e-mail is actually sent.</p>}
        </div>
      ) : (
        <form
          noValidate
          className="space-y-4"
          onSubmit={handleSubmit(async (v) => {
            setError(null);
            try {
              if (CLOUD) await getAuthService().requestPasswordReset(v.email);
              setSentTo(v.email);
            } catch (e) {
              setError(e instanceof AuthError ? e.message : 'Could not send the e-mail');
            }
          })}
        >
          <Field label="E-mail" error={formState.errors.email?.message}>
            {(p) => <Input {...p} type="email" autoComplete="email" {...register('email')} />}
          </Field>
          <FormError message={error} />
          <Button type="submit" block size="lg" disabled={formState.isSubmitting}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}

const resetSchema = z
  .object({ password: z.string().min(8, 'Use at least 8 characters'), confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });

/** Shown after a password-reset link opened the app (cloud only). */
export function ResetPasswordScreen() {
  const navigate = useNavigate();
  const recovery = useAuth((s) => s.recovery);
  const setAuth = useAuth((s) => s.set);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm({ resolver: zodResolver(resetSchema), defaultValues: { password: '', confirm: '' } });
  if (!CLOUD || !recovery) return <Navigate to="/" replace />;
  return (
    <AuthLayout title="Choose a new password">
      <form
        noValidate
        className="space-y-4"
        onSubmit={handleSubmit(async (v) => {
          setError(null);
          try {
            await getAuthService().updatePassword(v.password);
            setAuth({ recovery: false, notice: 'Your password has been changed.' });
            navigate('/', { replace: true });
          } catch (e) {
            setError(e instanceof AuthError ? e.message : 'Could not change the password');
          }
        })}
      >
        <div className="flex gap-2 rounded-xl bg-muted p-3 text-sm text-muted-foreground">
          <KeyRound className="size-4 shrink-0" aria-hidden="true" /> Use at least 8 characters. You stay signed in on this device.
        </div>
        <Field label="New password" error={formState.errors.password?.message}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" {...register('password')} />}
        </Field>
        <Field label="Confirm new password" error={formState.errors.confirm?.message}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" {...register('confirm')} />}
        </Field>
        <FormError message={error} />
        <Button type="submit" block size="lg" disabled={formState.isSubmitting}>
          Save new password
        </Button>
      </form>
    </AuthLayout>
  );
}

/** Briefly shown while an e-mail link (verification / reset) is being completed. */
export function AuthCallbackScreen() {
  return (
    <AuthLayout title="Signing you in…">
      <div className="flex items-center gap-3 text-sm text-muted-foreground" role="status">
        <Loader2 className="size-5 animate-spin" aria-hidden="true" /> Completing your e-mail link
      </div>
    </AuthLayout>
  );
}

/** Builds without cloud configuration and without an explicit local preview. */
export function NotConfiguredScreen() {
  return (
    <AuthLayout title="This build is not configured">
      <div className="flex gap-3 rounded-xl border bg-card p-4 text-sm">
        <TriangleAlert className="size-5 shrink-0 text-warning" aria-hidden="true" />
        <p>
          It has no Linqora Books cloud connection and the local preview is disabled, so nobody can sign in. Developers: see
          docs/SUPABASE_SETUP.md to build with a Supabase project, or build the local preview.
        </p>
      </div>
    </AuthLayout>
  );
}
