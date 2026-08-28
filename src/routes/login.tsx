import { useState, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Radar, Lock, Mail, Loader2, AlertCircle, CheckCircle2, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Entrar — Radar de Licitações" },
      {
        name: "description",
        content: "Acesso restrito do Operador ao Radar de Licitações.",
      },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { user, isLoading: authLoading, signInWithPassword, signInWithOtp, resetPassword } = useAuth();
  const navigate = useNavigate();

  // Estados do formulário de senha
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Estados do formulário de link mágico
  const [otpEmail, setOtpEmail] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpSuccess, setOtpSuccess] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);

  // Estados da recuperação de senha
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);

  // Se já estiver logado, redireciona para a raiz / dashboard
  useEffect(() => {
    if (!authLoading && user) {
      navigate({ to: "/" });
    }
  }, [user, authLoading, navigate]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMessage("Por favor, preencha o e-mail e a senha.");
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    const { error } = await signInWithPassword(email.trim(), password);

    if (error) {
      if (error.message.includes("Invalid login credentials") || error.message.includes("invalid_credentials")) {
        setErrorMessage("E-mail ou senha inválidos.");
      } else if (error.message.includes("Email not confirmed")) {
        setErrorMessage("E-mail ainda não confirmado. Verifique sua caixa de entrada.");
      } else {
        setErrorMessage("Não foi possível conectar. Verifique sua conexão e tente novamente.");
      }
      setLoading(false);
    } else {
      navigate({ to: "/" });
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpEmail) {
      setOtpError("Por favor, informe seu e-mail.");
      return;
    }

    setOtpLoading(true);
    setOtpError(null);
    setOtpSuccess(false);

    const { error } = await signInWithOtp(otpEmail.trim());

    if (error) {
      setOtpError(
        error.message.includes("rate limit")
          ? "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente."
          : "Não foi possível enviar o link mágico. Verifique o e-mail informado."
      );
    } else {
      setOtpSuccess(true);
    }
    setOtpLoading(false);
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) {
      setForgotError("Informe seu e-mail cadastrado.");
      return;
    }

    setForgotLoading(true);
    setForgotError(null);
    setForgotSuccess(false);

    const { error } = await resetPassword(forgotEmail.trim());

    if (error) {
      setForgotError("Erro ao solicitar redefinição. Verifique o e-mail.");
    } else {
      setForgotSuccess(true);
    }
    setForgotLoading(false);
  };

  if (authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        {/* Header com Marca */}
        <div className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
            <Radar className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Radar de Licitações</h1>
          <p className="text-sm text-muted-foreground">
            Plataforma privada de inteligência para licitações públicas
          </p>
        </div>

        {/* Card de Autenticação */}
        <Card className="border-border/60 shadow-lg">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-lg font-semibold text-center">Acesso do Operador</CardTitle>
            <CardDescription className="text-center text-xs">
              Entre com suas credenciais autorizadas
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <Tabs defaultValue="password" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="password">E-mail e Senha</TabsTrigger>
                <TabsTrigger value="magic-link">Link Mágico</TabsTrigger>
              </TabsList>

              {/* Aba: E-mail + Senha */}
              <TabsContent value="password">
                <form onSubmit={handlePasswordSubmit} className="space-y-4">
                  {errorMessage && (
                    <Alert variant="destructive" className="py-2.5">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription className="text-xs">{errorMessage}</AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-xs font-medium">
                      E-mail
                    </Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="operador@empresa.com.br"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={loading}
                        className="pl-9 text-sm"
                        autoComplete="email"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password" className="text-xs font-medium">
                        Senha
                      </Label>
                      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
                        <DialogTrigger asChild>
                          <button
                            type="button"
                            className="text-xs text-primary hover:underline font-medium"
                          >
                            Esqueci minha senha
                          </button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-md">
                          <DialogHeader>
                            <DialogTitle>Redefinição de Senha</DialogTitle>
                            <DialogDescription className="text-xs">
                              Enviaremos um link de recuperação para o seu e-mail cadastrado.
                            </DialogDescription>
                          </DialogHeader>

                          {forgotSuccess ? (
                            <div className="space-y-3 py-4">
                              <Alert className="border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                <AlertDescription className="text-xs">
                                  Instruções enviadas para seu e-mail! Verifique sua caixa de entrada.
                                </AlertDescription>
                              </Alert>
                            </div>
                          ) : (
                            <form onSubmit={handleForgotSubmit} className="space-y-4 py-2">
                              {forgotError && (
                                <Alert variant="destructive" className="py-2">
                                  <AlertCircle className="h-4 w-4" />
                                  <AlertDescription className="text-xs">{forgotError}</AlertDescription>
                                </Alert>
                              )}
                              <div className="space-y-2">
                                <Label htmlFor="forgot-email" className="text-xs">
                                  E-mail cadastrado
                                </Label>
                                <Input
                                  id="forgot-email"
                                  type="email"
                                  placeholder="operador@empresa.com.br"
                                  value={forgotEmail}
                                  onChange={(e) => setForgotEmail(e.target.value)}
                                  disabled={forgotLoading}
                                  required
                                />
                              </div>
                              <DialogFooter>
                                <Button type="submit" disabled={forgotLoading} className="w-full">
                                  {forgotLoading ? (
                                    <>
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      Enviando link...
                                    </>
                                  ) : (
                                    "Enviar link de recuperação"
                                  )}
                                </Button>
                              </DialogFooter>
                            </form>
                          )}
                        </DialogContent>
                      </Dialog>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="password"
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={loading}
                        className="pl-9 text-sm"
                        autoComplete="current-password"
                        required
                      />
                    </div>
                  </div>

                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Autenticando...
                      </>
                    ) : (
                      "Entrar no Sistema"
                    )}
                  </Button>
                </form>
              </TabsContent>

              {/* Aba: Link Mágico */}
              <TabsContent value="magic-link">
                {otpSuccess ? (
                  <div className="space-y-4 py-2 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-6 w-6" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-sm font-semibold">Link enviado!</h3>
                      <p className="text-xs text-muted-foreground">
                        Enviamos um link de acesso direto para <strong>{otpEmail}</strong>. Acesse seu e-mail para entrar.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setOtpSuccess(false);
                        setOtpEmail("");
                      }}
                      className="text-xs"
                    >
                      Enviar para outro e-mail
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleOtpSubmit} className="space-y-4">
                    {otpError && (
                      <Alert variant="destructive" className="py-2.5">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription className="text-xs">{otpError}</AlertDescription>
                      </Alert>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="otp-email" className="text-xs font-medium">
                        E-mail
                      </Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="otp-email"
                          type="email"
                          placeholder="operador@empresa.com.br"
                          value={otpEmail}
                          onChange={(e) => setOtpEmail(e.target.value)}
                          disabled={otpLoading}
                          className="pl-9 text-sm"
                          required
                        />
                      </div>
                    </div>

                    <Button type="submit" className="w-full" disabled={otpLoading}>
                      {otpLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Enviando link mágico...
                        </>
                      ) : (
                        "Enviar link de acesso"
                      )}
                    </Button>
                  </form>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>

          {/* Nota discreta de acesso restrito */}
          <CardFooter className="flex items-center justify-center border-t border-border/40 py-3 bg-muted/20 rounded-b-xl">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldAlert className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
              <span>Acesso restrito à sua empresa — sem cadastro público</span>
            </div>
          </CardFooter>
        </Card>
      </div>
    </main>
  );
}
