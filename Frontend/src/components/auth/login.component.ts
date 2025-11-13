import { Component, OnDestroy, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Router, RouterModule } from "@angular/router";
import { AuthService } from "../../services/auth.service";

@Component({
  selector: "app-login",
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <div class="auth-container">
      <h2>Iniciar sesión</h2>
      <form (ngSubmit)="onSubmit()" #f="ngForm" novalidate>
        <label>Email</label>
        <input name="email" [(ngModel)]="email" type="email" required />

        <label>Contraseña</label>
        <input
          name="password"
          [(ngModel)]="password"
          type="password"
          required
        />

        <button type="submit" [disabled]="loading || retryInSeconds > 0">
          {{ retryInSeconds > 0 ? "Espera " + retryInSeconds + "s" : "Entrar" }}
        </button>
      </form>

      <p class="error" *ngIf="error">{{ error }}</p>

      <div class="links">
        <a routerLink="/register">Crear cuenta</a>
      </div>
    </div>
  `,
  styles: [
    `
      .auth-container {
        max-width: 420px;
        margin: 40px auto;
        padding: 24px;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        background: #fff;
      }
      h2 {
        margin-bottom: 16px;
      }
      label {
        display: block;
        margin-top: 12px;
        font-weight: 600;
      }
      input {
        width: 100%;
        padding: 10px;
        margin-top: 6px;
        border: 1px solid #d1d5db;
        border-radius: 8px;
      }
      button {
        margin-top: 16px;
        width: 100%;
        padding: 10px;
        background: #2563eb;
        color: #fff;
        border: none;
        border-radius: 8px;
        cursor: pointer;
      }
      button[disabled] {
        opacity: 0.6;
        cursor: not-allowed;
      }
      .error {
        color: #b91c1c;
        margin-top: 12px;
      }
      .links {
        display: flex;
        justify-content: space-between;
        margin-top: 12px;
      }
      .links a {
        color: #2563eb;
        text-decoration: none;
      }
    `,
  ],
})
export class LoginComponent implements OnInit, OnDestroy {
  email = "";
  password = "";
  error = "";
  loading = false;
  retryInSeconds = 0;
  private timerId: any;

  constructor(private auth: AuthService, private router: Router) {}

  ngOnInit(): void {
    // Mostrar mensaje trasladado desde el interceptor (ej. 403)
    try {
      const msg = sessionStorage.getItem("auth_message");
      if (msg) {
        this.error = msg;
        sessionStorage.removeItem("auth_message");
      }
    } catch {}
  }

  ngOnDestroy(): void {
    if (this.timerId) clearInterval(this.timerId);
  }

  private startCooldown(seconds: number) {
    this.retryInSeconds = Math.max(1, Math.floor(seconds));
    if (this.timerId) clearInterval(this.timerId);
    this.timerId = setInterval(() => {
      this.retryInSeconds -= 1;
      if (this.retryInSeconds <= 0) {
        clearInterval(this.timerId);
        this.timerId = null;
      }
    }, 1000);
  }

  private parseRetryAfter(headerValue: string | null): number {
    if (!headerValue) return 0;
    const asNumber = Number(headerValue);
    if (!Number.isNaN(asNumber) && asNumber > 0) return asNumber;
    const date = new Date(headerValue);
    const diffMs = date.getTime() - Date.now();
    return diffMs > 0 ? Math.ceil(diffMs / 1000) : 0;
  }

  onSubmit() {
    if (!this.email || !this.password || this.retryInSeconds > 0) return;
    this.loading = true;
    this.error = "";
    this.auth.login(this.email, this.password).subscribe({
      next: () => this.router.navigate(["/dashboard"]),
      error: (err) => {
        // Manejo de 429 Too Many Requests con Retry-After
<<<<<<< HEAD
        const is429 = (err?.status === 429) || /HTTP\s*429/i.test(err?.message || '');
        if (is429) {
          const retryAfterHeader = err?.headers?.get?.('Retry-After') ?? err?.error?.retryAfter ?? null;
          const seconds = this.parseRetryAfter(retryAfterHeader);
          this.startCooldown(seconds || 30); // fallback 30s si no viene header
          // Mostrar mensaje del backend si viene, si no usar uno genérico
          const raw429 = (err?.error?.error || err?.error?.message || (typeof err?.error === 'string' ? err.error : '') || err?.message || '');
          const friendly429 = String(raw429).replace(/^HTTP\s*429\s*:\s*/i, '').trim();
          this.error = friendly429 || ('Demasiados intentos. Intenta de nuevo en ' + this.retryInSeconds + 's');
        } else {
          // Extraer mensaje desde distintas formas: {error}, {message}, string o Error.message
          const raw = (err?.error?.error || err?.error?.message || (typeof err?.error === 'string' ? err.error : '') || err?.message || '');
          // Quitar prefijo tipo "HTTP 401:" si viene de fetch helpers
          const friendly = String(raw).replace(/^HTTP\s*\d+\s*:\s*/i, '').trim();
          this.error = friendly || 'Error al iniciar sesión';
=======
        if (err?.status === 429) {
          const retryAfterHeader =
            err?.headers?.get?.("Retry-After") ??
            err?.error?.retryAfter ??
            null;
          const seconds = this.parseRetryAfter(retryAfterHeader);
          this.startCooldown(seconds || 30); // fallback 30s si no viene header
          this.error =
            "Demasiados intentos. Intenta de nuevo en " +
            this.retryInSeconds +
            "s";
        } else {
          this.error = err?.error?.message || "Error al iniciar sesión";
>>>>>>> 1133536a825e25f73977b227d025ab8fb5dc4760
        }
        this.loading = false;
      },
    });
  }
}
