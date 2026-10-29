# Worker das automações (`automation-worker`)

Edge Function (Deno) que processa a fila `automation_jobs` das automações dos
databases. **Não é chamada pelo app**: é agendada pelo `pg_cron` (via `pg_net`).

O motor de casamento/aplicação das regras vive em
[`../_shared/automation.ts`](../_shared/automation.ts) (auto-contido, compartilhado
com o app) e é testado por `src/lib/automation-engine.test.ts`.

## Variáveis de ambiente / secrets

| Variável | Onde | Descrição |
| --- | --- | --- |
| `SUPABASE_URL` | automático | Injetada pelo runtime das Edge Functions. |
| `SUPABASE_SERVICE_ROLE_KEY` | automático | Injetada pelo runtime. **Nunca** exponha no cliente. |
| `AUTOMATION_WORKER_SECRET` | `supabase secrets set` | Segredo comparado com o header `x-automation-secret`. |

O `verify_jwt` está `false` em `supabase/config.toml` porque o chamador é o
`pg_cron` (não há JWT). A autenticação é o header de segredo.

## Deploy

```bash
supabase secrets set AUTOMATION_WORKER_SECRET="<segredo-forte>"
supabase functions deploy automation-worker
```

Verificação de tipos local (não há CI no repo):

```bash
deno check supabase/functions/automation-worker/index.ts
```

## Pré-requisitos no projeto Supabase (uma vez)

1. Habilitar as extensões `pg_cron`, `pg_net` e o **Vault**
   (Dashboard → Database → Extensions).
2. Criar os secrets no Vault (SQL Editor):

   ```sql
   select vault.create_secret(
     'https://<project-ref>.supabase.co/functions/v1/automation-worker',
     'automation_worker_url'
   );
   select vault.create_secret('<mesmo-segredo-do-secret-set>', 'automation_worker_secret');
   ```

3. Agendar os dois jobs (`pg_cron`). O `enqueue_date_automations()` já vem na
   migration; o agendamento fica aqui de propósito, para não quebrar o
   `supabase db push` quando as extensões não estão habilitadas.

   ```sql
   -- 1) Varre os gatilhos "data chegou" a cada 15 min (janela [hoje-1, hoje]).
   select cron.schedule(
     'automations-dates',
     '*/15 * * * *',
     $$select public.enqueue_date_automations();$$
   );

   -- 2) Chama o worker a cada minuto (o worker drena a fila; MAX_JOBS=25).
   select cron.schedule(
     'automation-worker',
     '* * * * *',
     $$
     select net.http_post(
       url := (select decrypted_secret from vault.decrypted_secrets
               where name = 'automation_worker_url'),
       headers := jsonb_build_object(
         'content-type', 'application/json',
         'x-automation-secret',
         (select decrypted_secret from vault.decrypted_secrets
          where name = 'automation_worker_secret')
       ),
       body := '{}'::jsonb
     );
     $$
   );
   ```

Sem esses passos nada roda: a migration cria as tabelas/triggers/RPC, mas a fila
só é drenada quando os crons existem.

## Como funciona

- Cada escrita em `database_rows` enfileira **um** job (`row_created` ou
  `row_updated` com o diff das colunas) pelo trigger
  `enqueue_automation_jobs()`. A chave única
  `(database_id, row_id, trigger_key)` é a idempotência.
- O worker pega os jobs pendentes com `automation_claim_jobs` (`FOR UPDATE SKIP
  LOCKED`), casa todas as regras do database em TS e aplica as ações.
- **Encadeamento**: as escritas do worker levam o header
  `x-automation-depth` (`depth + 1`), que o trigger lê do GUC `request.headers`.
  Com profundidade 4 (`depthExceeded`, teto 3) o job vira `skipped`.
- Falhas: até 3 tentativas, com backoff (`run_after`); depois `failed` +
  `last_error`.

## Runbook de validação manual

Depois de publicar a função e agendar os crons, com três regras de exemplo
("Status vira Concluído → Data de conclusão = hoje"; "Vence em chega → Status =
Em andamento"; "linha criada com Prioridade Alta → criar linha em *Revisões*"):

1. **Encadeamento**: mude o status de uma linha para "Concluído" e confira que a
   "Data de conclusão" é preenchida e que a linha criada em *Revisões* também
   entra pelas regras dela.
2. **Teto**: force uma cadeia de 4 níveis e confirme que o job de profundidade 4
   fica com `status = 'skipped'` em `automation_jobs`. Se jobs ficarem sempre com
   `depth = 0`, o GUC `request.headers` não está disponível no contexto do
   trigger — o encadeamento não está funcionando (ver Riscos do plano).
3. **Idempotência**: rode `select public.enqueue_date_automations();` duas vezes e
   confirme que não há jobs duplicados (a chave única impede).
4. **Sem regras**: num database sem automações, escrever linhas não deve criar
   nenhum job (caminho barato do trigger).
