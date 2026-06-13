-- Upgrade da Producao HAGAV para central de acompanhamento.
-- ClickUp segue como fonte da operacao; o admin guarda links e caminhos locais.

alter table public.production_jobs
  add column if not exists clickup_url text,
  add column if not exists clickup_task_id text,
  add column if not exists pasta_materiais text,
  add column if not exists projeto_premiere text;

create index if not exists idx_production_jobs_clickup_task_id
  on public.production_jobs(clickup_task_id);

comment on column public.production_jobs.clickup_url is
  'Link manual para a tarefa no ClickUp. ClickUp permanece como fonte operacional.';

comment on column public.production_jobs.clickup_task_id is
  'Identificador manual da tarefa no ClickUp para futura sincronizacao.';

comment on column public.production_jobs.pasta_materiais is
  'Caminho local/SSD para materiais da demanda.';

comment on column public.production_jobs.projeto_premiere is
  'Caminho local/SSD do arquivo de projeto Premiere quando existir.';
