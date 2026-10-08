import 'dotenv/config';

export interface D1QueryResult<T = any> {
  results: T[];
  success: boolean;
  meta?: any;
}

class D1Client {
  private accountId: string;
  private databaseId: string;
  private apiToken: string;

  constructor() {
    this.accountId = (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
    this.databaseId = (process.env.CLOUDFLARE_D1_DATABASE_ID || process.env.D1_DATABASE_ID || '').trim();
    this.apiToken = (process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_D1_TOKEN || '').trim();
  }

  private quotaExceededUntil = 0;

  public isConfigured(): boolean {
    return Boolean(this.accountId && this.databaseId && this.apiToken);
  }

  public isQuotaExceeded(): boolean {
    return Date.now() < this.quotaExceededUntil;
  }

  public markQuotaExceeded(hours: number = 6): void {
    this.quotaExceededUntil = Date.now() + hours * 60 * 60 * 1000;
  }

  /**
   * Execute an SQL query against Cloudflare D1
   */
  public async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    if (!this.isConfigured()) {
      throw new Error(
        'Cloudflare D1 no está configurado. Asegúrate de definir CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID y CLOUDFLARE_API_TOKEN en tu .env'
      );
    }

    if (this.isQuotaExceeded()) {
      throw new Error('D1_QUOTA_EXCEEDED: Límite diario de Cloudflare D1 alcanzado. Conmutando a MongoDB Atlas.');
    }

    const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/d1/database/${this.databaseId}/query`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sql,
          params,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        if (errText.includes('7500') || errText.includes('exceeded D1') || errText.includes('daily row read limit')) {
          this.markQuotaExceeded(6);
          console.warn('⚠️ [Cloudflare D1] Límite diario gratuito de lecturas superado (Código 7500). Conmutando tráfico a MongoDB Atlas.');
          throw new Error('D1_QUOTA_EXCEEDED: Límite diario de lecturas superado en Cloudflare D1.');
        }
        console.error('❌ [Cloudflare D1 Query] Error body:', errText);
        throw new Error(`Error en Cloudflare D1 HTTP [${response.status}]: ${errText}`);
      }

      const json = await response.json();
      console.log('🔍 [Cloudflare D1 Query] Success JSON received');

      if (!json.success || !json.result || !json.result[0]) {
        console.error('❌ [Cloudflare D1 Query] JSON error:', JSON.stringify(json));
        throw new Error(json.errors?.[0]?.message || 'Error desconocido ejecutando consulta en D1');
      }

      return json.result[0].results as T[];
    } catch (err: any) {
      console.error('❌ [Cloudflare D1 Query Error]:', err.message);
      throw err;
    }
  }

  /**
   * Run a health check / ping on the D1 database
   */
  public async ping(): Promise<{ connected: boolean; version?: string; error?: string }> {
    try {
      const result = await this.query<{ val: number }>('SELECT 1 as val');
      return { connected: result?.[0]?.val === 1 };
    } catch (err: any) {
      return { connected: false, error: err.message };
    }
  }

  /**
   * Fetch all eSIM plans for a given country code
   */
  public async getPlansByCountry(countryCode: string) {
    return this.query(
      'SELECT * FROM esim_plans WHERE UPPER(country_code) = UPPER(?) ORDER BY price_eur ASC',
      [countryCode]
    );
  }

  /**
   * Fetch all user eSIMs for an account
   */
  public async getUserEsims(userId: string) {
    return this.query(
      'SELECT * FROM user_esims WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
  }
}

export const d1Client = new D1Client();

export function buildDestinationRowsFromPlans(rows: any[]) {
  const map = new Map<string, any>();
  for (const r of rows) {
    if (!map.has(r.country_code)) {
      map.set(r.country_code, { ...r, plansCount: 1 });
    } else {
      map.get(r.country_code).plansCount++;
    }
  }
  return Array.from(map.values());
}
