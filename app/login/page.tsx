import { AuthForm } from "@/components/auth/auth-form";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-brand-black p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-x-0 top-0 flex h-2">
          <span className="flex-1 bg-brand-magenta" />
          <span className="flex-1 bg-brand-cyan" />
          <span className="flex-1 bg-brand-yellow" />
        </div>
        <div className="absolute -left-24 top-1/3 size-80 rounded-full bg-brand-magenta/20 blur-3xl" />
        <div className="absolute -bottom-20 right-0 size-96 rounded-full bg-brand-cyan/20 blur-3xl" />

        <div className="relative z-10 text-4xl font-black tracking-[-0.06em]">
          We<span className="text-brand-cyan">Moot</span>
        </div>

        <div className="relative z-10">
          <p className="mb-4 text-sm font-bold uppercase tracking-[.25em] text-brand-yellow">
            Organiza. Conecta. Juega.
          </p>
          <h1 className="max-w-xl text-5xl font-bold leading-tight">
            Tu próximo evento empieza con una conversación.
          </h1>
        </div>

        <p className="relative z-10 text-sm text-white/60">
          Asistente inteligente para organizadores de fútbol.
        </p>
      </section>

      <section className="relative flex items-center justify-center overflow-hidden bg-white p-6">
        <div className="absolute -right-32 -top-32 size-80 rounded-full bg-brand-cyan/10 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 size-72 rounded-full bg-brand-magenta/10 blur-3xl" />
        <div className="relative z-10 w-full max-w-md">
          <div className="mb-8 text-3xl font-black tracking-[-0.06em] lg:hidden">
            We<span className="text-brand-cyan">Moot</span>
          </div>
          <div className="mb-5 h-1 w-12 bg-brand-magenta" />
          <h2 className="text-3xl font-bold tracking-tight">Bienvenido</h2>
          <p className="mb-7 mt-2 text-brand-black/60">
            Accede al panel de organización.
          </p>
          <AuthForm />
        </div>
      </section>
    </main>
  );
}
