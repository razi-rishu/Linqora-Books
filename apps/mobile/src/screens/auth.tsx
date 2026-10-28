import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChartColumn, FileText, ShieldCheck, Info, MailCheck } from 'lucide-react';
import { BrandMark, TestModeBanner } from '@/components/common';
import { Button, ButtonLink } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { AuthError, useSession } from '@/state/session';
import { useSubscription } from '@/state/subscription';
import { useBooksQuery } from '@/data/books';

/** Decides where a signed-in user belongs in the onboarding flow. */
function useNextOnboardingRoute(): string | null {
  const user = useSession((s) => s.user);
  const introSeen = useSubscription((s) => s.introSeen);
  const { data, isLoading } = useBooksQuery();
  if (!user) return '/welcome';
  if (isLoading) return null;
  if (!introSeen) return '/subscribe';
  if (!data) return '/setup';
  return '/app';
}

export function SplashScreen() {
  const navigate = useNavigate();
  const next = useNextOnboardingRoute();
  useEffect(() => {
    if (!next) return;
    const timer = setTimeout(() => navigate(next, { replace: true }), 900);
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
  return (
    <div className="mb-5 flex gap-2 rounded-xl border bg-muted p-3 text-xs text-muted-foreground">
      <Info className="size-4 shrink-0" aria-hidden="true" />
      <p>
        Local prototype: no real account is created and your password is not stored or sent anywhere. Secure sign-in
        arrives with cloud accounts.
      </p>
    </div>
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
  const signIn = useSession((s) => s.signIn);
  const [error, setError] = useState<string | null>(null);
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
      <PrototypeAuthNotice />
      <form
        noValidate
        className="space-y-4"
        onSubmit={handleSubmit((values) => {
          try {
            signIn(values.email);
            navigate('/', { replace: true });
          } catch (e) {
            setError(e instanceof AuthError ? e.message : 'Sign-in failed');
          }
        })}
      >
        <Field label="E-mail" error={formState.errors.email?.message}>
          {(p) => <Input {...p} type="email" autoComplete="email" inputMode="email" {...register('email')} />}
        </Field>
        <Field label="Password" error={formState.errors.password?.message}>
          {(p) => <Input {...p} type="password" autoComplete="current-password" {...register('password')} />}
        </Field>
        {error && (
          <p role="alert" className="rounded-xl bg-negative-soft p-3 text-sm text-negative">
            {error}
          </p>
        )}
        <Button type="submit" block size="lg">
          Sign in
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
  const signUp = useSession((s) => s.signUp);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: '', email: '', password: '', confirm: '', terms: false },
  });
  return (
    <AuthLayout
      title="Create your account"
      subtitle="One month free trial with full access."
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
        onSubmit={handleSubmit((values) => {
          try {
            signUp(values.name, values.email);
            navigate('/subscribe', { replace: true });
          } catch (e) {
            setError(e instanceof AuthError ? e.message : 'Sign-up failed');
          }
        })}
      >
        <Field label="Your name" error={formState.errors.name?.message}>
          {(p) => <Input {...p} autoComplete="name" {...register('name')} />}
        </Field>
        <Field label="E-mail" error={formState.errors.email?.message} hint="In the real app we will send a verification link.">
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
          <span>I understand this is a prototype and agree to the terms and privacy policy (to be published before launch).</span>
        </label>
        {formState.errors.terms && <p className="text-sm text-negative">{formState.errors.terms.message}</p>}
        {error && (
          <p role="alert" className="rounded-xl bg-negative-soft p-3 text-sm text-negative">
            {error}
          </p>
        )}
        <Button type="submit" block size="lg">
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}

const forgotSchema = z.object({ email: z.email('Enter a valid e-mail address') });

export function ForgotPasswordScreen() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm({ resolver: zodResolver(forgotSchema), defaultValues: { email: '' } });
  return (
    <AuthLayout title="Reset your password" subtitle="We'll e-mail you a link to choose a new password." footer={<Link to="/sign-in" className="text-primary">Back to sign in</Link>}>
      {sentTo ? (
        <div className="rounded-xl border bg-card p-5 text-center">
          <MailCheck className="mx-auto size-8 text-primary" aria-hidden="true" />
          <p className="mt-3 font-medium">Check your inbox</p>
          <p className="mt-1 text-sm text-muted-foreground">
            If an account exists for <strong>{sentTo}</strong>, a reset link will be sent.
          </p>
          <p className="mt-3 rounded-lg bg-warning-soft p-2 text-xs text-warning">
            TEST MODE: no e-mail is actually sent in this prototype.
          </p>
        </div>
      ) : (
        <form noValidate className="space-y-4" onSubmit={handleSubmit((v) => setSentTo(v.email))}>
          <Field label="E-mail" error={formState.errors.email?.message}>
            {(p) => <Input {...p} type="email" autoComplete="email" {...register('email')} />}
          </Field>
          <Button type="submit" block size="lg">
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
