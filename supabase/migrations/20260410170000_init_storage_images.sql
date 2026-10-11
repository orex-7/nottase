-- Migration: cria o bucket público `page-images` para as imagens das páginas
-- do editor estilo Notion, com políticas de RLS por pasta do usuário.
-- Aplicar com: supabase db push

-- ----------------------------------------------------------------------------
-- Bucket de imagens de páginas (leitura pública, escrita restrita ao dono)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'page-images',
  'page-images',
  true,
  5242880, -- 5 MB
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ----------------------------------------------------------------------------
-- RLS: escrita restrita ao dono (um usuário só mexe na pasta <user_id>/...).
-- NÃO criamos policy de SELECT: o bucket é público, então a leitura da imagem
-- usa o endpoint /object/public/... (não passa pelo RLS). Sem policy SELECT,
-- ninguém consegue LISTAR o conteúdo do bucket (evita o alerta de segurança
-- "Os clientes podem listar todos os arquivos neste bucket").
-- ----------------------------------------------------------------------------
drop policy if exists "Imagens de página são públicas" on storage.objects;

drop policy if exists "Usuário envia imagens para sua pasta" on storage.objects;
create policy "Usuário envia imagens para sua pasta"
  on storage.objects for insert
  with check (
    bucket_id = 'page-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Usuário atualiza imagens da sua pasta" on storage.objects;
create policy "Usuário atualiza imagens da sua pasta"
  on storage.objects for update
  using (
    bucket_id = 'page-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'page-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Usuário remove imagens da sua pasta" on storage.objects;
create policy "Usuário remove imagens da sua pasta"
  on storage.objects for delete
  using (
    bucket_id = 'page-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
