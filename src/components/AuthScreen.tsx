import { useState, useRef } from "react";
import Icon from "@/components/ui/icon";
import { login, register, verify2faSetup, verify2fa } from "@/lib/api";

interface AuthScreenProps {
  onAuth: () => void;
}

type Step = "credentials" | "setup_2fa" | "verify_2fa";

export default function AuthScreen({ onAuth }: AuthScreenProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [step, setStep] = useState<Step>("credentials");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [pendingUserId, setPendingUserId] = useState("");
  const [totpSecret, setTotpSecret] = useState("");
  const [totpUri, setTotpUri] = useState("");
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "register") {
        const data = await register(username, displayName, password);
        setPendingUserId(data.user_id);
        setTotpSecret(data.totp_secret);
        setTotpUri(data.totp_uri);
        setStep("setup_2fa");
      } else {
        const data = await login(username, password);
        setPendingUserId(data.user_id);
        if (data.requires_2fa_setup) {
          setTotpSecret(data.totp_secret);
          setTotpUri(data.totp_uri);
          setStep("setup_2fa");
        } else if (data.requires_2fa) {
          setStep("verify_2fa");
        } else {
          onAuth();
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newDigits = [...otpDigits];
    newDigits[index] = value.slice(-1);
    setOtpDigits(newDigits);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    const newDigits = [...otpDigits];
    for (let i = 0; i < 6; i++) {
      newDigits[i] = pasted[i] || "";
    }
    setOtpDigits(newDigits);
    const focusIdx = Math.min(pasted.length, 5);
    inputRefs.current[focusIdx]?.focus();
  };

  const handleVerify = async () => {
    const code = otpDigits.join("");
    if (code.length !== 6) {
      setError("Введите 6 цифр");
      return;
    }
    setError("");
    setLoading(true);
    try {
      if (step === "setup_2fa") {
        await verify2faSetup(pendingUserId, code);
      } else {
        await verify2fa(pendingUserId, code);
      }
      onAuth();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Ошибка");
      setOtpDigits(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const otpCode = otpDigits.join("");

  if (step === "setup_2fa") {
    return (
      <div className="h-screen w-screen bg-background flex items-center justify-center px-4 py-8 overflow-y-auto">
        <div className="w-full max-w-sm animate-fade-up">
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-[var(--hazy-amber-dim)] flex items-center justify-center mx-auto mb-4">
              <Icon name="ShieldCheck" size={28} className="text-[var(--hazy-amber)]" />
            </div>
            <h2 className="text-lg font-bold mb-1">Защитите аккаунт</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Для входа потребуется одноразовый код
            </p>
          </div>

          <div className="space-y-3 mb-5">
            <SetupStep
              num="1"
              title="Установите приложение"
              desc="Google Authenticator, Authy или 1Password"
            />
            <SetupStep
              num="2"
              title="Скопируйте ключ и добавьте в приложение"
              desc="Нажмите «+» → Ввести ключ вручную"
            />
          </div>

          <div className="mb-5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2 px-1">
              Ваш секретный ключ
            </p>
            <CopyKeyBlock value={totpSecret} />
          </div>

          <details className="mb-5 group">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors flex items-center gap-1.5 px-1">
              <Icon name="QrCode" size={14} />
              Показать QR-код (для десктопа)
              <Icon name="ChevronDown" size={12} className="group-open:rotate-180 transition-transform" />
            </summary>
            <div className="flex justify-center mt-3">
              <div className="p-3 rounded-2xl bg-white">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(totpUri)}`}
                  alt="QR Code"
                  width={180}
                  height={180}
                  className="rounded-lg"
                />
              </div>
            </div>
          </details>

          <div className="mb-4">
            <SetupStep
              num="3"
              title="Введите код из приложения"
              desc="6 цифр, которые показывает приложение"
            />
            <div className="flex gap-2 justify-center mt-3" onPaste={handleOtpPaste}>
              {otpDigits.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { inputRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(i, e)}
                  className="w-11 h-13 rounded-xl bg-[var(--hazy-surface)] border-0 text-center text-lg font-bold focus:outline-none focus:ring-2 focus:ring-[var(--hazy-amber)] transition-all"
                />
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-red-400 px-1 mb-3 text-center">{error}</p>}

          <button
            onClick={handleVerify}
            disabled={loading || otpCode.length !== 6}
            className="w-full h-11 rounded-xl bg-[var(--hazy-amber)] text-[#111] text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? "Проверка..." : "Подтвердить и войти"}
          </button>
        </div>
      </div>
    );
  }

  if (step === "verify_2fa") {
    return (
      <div className="h-screen w-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-sm animate-fade-up">
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-[var(--hazy-amber-dim)] flex items-center justify-center mx-auto mb-4">
              <Icon name="KeyRound" size={28} className="text-[var(--hazy-amber)]" />
            </div>
            <h2 className="text-lg font-bold mb-1">Двухфакторная аутентификация</h2>
            <p className="text-xs text-muted-foreground">Введите код из приложения-аутентификатора</p>
          </div>

          <div className="mb-4">
            <div className="flex gap-2 justify-center" onPaste={handleOtpPaste}>
              {otpDigits.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { inputRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(i, e)}
                  className="w-11 h-13 rounded-xl bg-[var(--hazy-surface)] border-0 text-center text-lg font-bold focus:outline-none focus:ring-2 focus:ring-[var(--hazy-amber)] transition-all"
                />
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-red-400 px-1 mb-3 text-center">{error}</p>}

          <button
            onClick={handleVerify}
            disabled={loading || otpCode.length !== 6}
            className="w-full h-11 rounded-xl bg-[var(--hazy-amber)] text-[#111] text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? "Проверка..." : "Войти"}
          </button>

          <button
            onClick={() => { setStep("credentials"); setOtpDigits(["", "", "", "", "", ""]); setError(""); }}
            className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors mt-4 py-2"
          >
            Назад
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm animate-fade-up">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-[var(--hazy-amber)] tracking-tight mb-2">hazy</h1>
          <p className="text-sm text-muted-foreground flex items-center justify-center gap-1.5">
            <Icon name="ShieldCheck" size={14} className="text-[var(--hazy-amber)]" />
            E2E зашифрованный мессенджер
          </p>
        </div>

        <form onSubmit={handleCredentials} className="space-y-3">
          {mode === "register" && (
            <input
              type="text"
              placeholder="Отображаемое имя"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full h-11 px-4 rounded-xl bg-[var(--hazy-surface)] border-0 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[var(--hazy-amber-dim)]"
            />
          )}
          <input
            type="text"
            placeholder="Логин"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full h-11 px-4 rounded-xl bg-[var(--hazy-surface)] border-0 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[var(--hazy-amber-dim)]"
          />
          <input
            type="password"
            placeholder="Пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full h-11 px-4 rounded-xl bg-[var(--hazy-surface)] border-0 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[var(--hazy-amber-dim)]"
          />

          {error && <p className="text-xs text-red-400 px-1">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 rounded-xl bg-[var(--hazy-amber)] text-[#111] text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? "Загрузка..." : mode === "login" ? "Войти" : "Создать аккаунт"}
          </button>
        </form>

        <button
          onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
          className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors mt-4 py-2"
        >
          {mode === "login" ? "Нет аккаунта? Зарегистрироваться" : "Уже есть аккаунт? Войти"}
        </button>
      </div>
    </div>
  );
}

function SetupStep({ num, title, desc }: { num: string; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3 px-1">
      <div className="w-6 h-6 rounded-full bg-[var(--hazy-amber)] text-[#111] text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
        {num}
      </div>
      <div>
        <p className="text-sm font-medium leading-tight">{title}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{desc}</p>
      </div>
    </div>
  );
}

function CopyKeyBlock({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatted = value.match(/.{1,4}/g)?.join(" ") || value;

  return (
    <button
      onClick={handleCopy}
      className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-[var(--hazy-surface)] hover:bg-[var(--hazy-surface-hover)] transition-colors text-left active:scale-[0.98] group"
    >
      <code className="flex-1 text-sm font-mono text-[var(--hazy-amber)] tracking-wider select-all break-all leading-relaxed">
        {formatted}
      </code>
      <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-[var(--hazy-amber-dim)] flex items-center justify-center group-hover:bg-[var(--hazy-amber)] group-hover:text-[#111] transition-colors">
        <Icon name={copied ? "Check" : "Copy"} size={16} className={copied ? "text-[var(--hazy-amber)]" : ""} />
      </div>
    </button>
  );
}