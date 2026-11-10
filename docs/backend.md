# Delivery Q’Cone

Supabase: projeto `beolpmiezusawbkzjlez` na região São Paulo. Admin: `/admin/`, conta proprietária configurada no Supabase. A senha não está no repositório; MFA não é obrigatório.

## Operação da loja

A loja está aberta para pedidos por autorização do proprietário. Sem horários configurados, abertura e fechamento são manuais em Loja e entrega. Se configurar horários, o banco os valida em Brasília. Atualize identificação do fornecedor, nome/CPF/CNPJ e previsão de entrega conforme a operação real.

Endereço de produção: endereço definido no painel e armazenado no Supabase. Todos os bairros da cidade estão ativos com taxa a combinar pelo WhatsApp. O checkout exibe o subtotal sem entrega. O dono combina o valor pelo contato do pedido e registra a taxa acordada antes de confirmar; o banco impede confirmar sem essa etapa.

Por solicitação do proprietário, cadastro tem e-mail e senha sem confirmação por e-mail e sem recuperação de senha nesta versão. A função qcone-signup cria a conta pelo Auth Admin API e registra o aceite explícito. Há limite persistente de cinco tentativas por hora por identificador de rede com hash e segredo. Credenciais service_role permanecem no ambiente Edge. E-mail não verificado não comprova identidade: nunca conceda admin apenas por endereço de e-mail. O cliente sem acesso à senha precisa contatar o responsável; não há recuperação automática.

SMTP não é necessário nesta versão. Para ativar e-mails futuramente, use um provedor compatível (por exemplo Resend/Brevo), verifique domínio/remetente e configure host, porta, usuário e senha em Supabase → Authentication → Email → SMTP Settings. Não publique a senha. Configure também Site URL e Redirect URLs. [Documentação SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

## Funcionalidades

Carrinho sem conta persiste no navegador, apenas com produtos e quantidades. Checkout exige login, contato e endereço, permite editar dados e salvar até dez endereços. Nome/telefone ficam salvos para reutilização. Histórico e painel têm atualização manual, paginação, status e cancelamento do pedido ainda pendente. O admin consulta dados completos por pedido, registra pagamento e altera preços, estoque, disponibilidade, horários e taxas.

Pagamento exclusivamente na entrega: Pix, dinheiro ou cartão. Não há captura online nem coleta de número de cartão. Não foram incluídos gateway, rastreamento GPS, emissão fiscal ou notificações externas.

## Segurança

Todas as tabelas têm RLS. O catálogo público é somente leitura. Tabelas pessoais estão em `qcone_private`, com acesso direto revogado e RLS negando por padrão. Os avisos INFO de RLS sem políticas nesse schema são intencionais. Não adicione esse schema aos schemas expostos na Data API.

Nome, telefone, endereços e snapshots de destinatário/observações são criptografados via pgcrypto AES-256. A chave aleatória é mantida no Supabase Vault. Não apague `qcone_pii_v1`: perder a chave impede recuperação. Backups e restauração devem incluir as chaves gerenciadas pelo Vault. Não é criptografia ponta a ponta: funções autorizadas e o proprietário do banco conseguem descriptografar. E-mail fica no Auth; metadados operacionais não possuem criptografia em nível de campo.

RPCs públicas SECURITY INVOKER chamam operações privadas que exigem conta confirmada e sessão ativa. Administração é definida na tabela privada, sem confiar em user_metadata. A consulta de dados de clientes pelo admin gera auditoria. Não há service_role no código público.

O banco valida preços em centavos, horário, área de entrega, pedido mínimo, estoque e limite por usuário. Idempotência e transações evitam duplicação; cancelamento repõe estoque exatamente uma vez. Índices cobrem propriedade, status, histórico e chaves estrangeiras. Avisos de índices não utilizados são esperados em banco novo. HTTPS e CSP são aplicados no Cloudflare.

## Privacidade

Política e termos estão em `/privacidade/` e `/termos/`, com aceite versionado. São textos iniciais que precisam refletir os dados e a operação reais do fornecedor. O cliente pode atualizar contato, excluir endereços, baixar os dados e registrar protocolo de exclusão. Outros direitos podem ser solicitados por e-mail.

Para exclusão: verifique identidade e pedidos ativos; analise retenção obrigatória e informe o titular. No Auth, revogue sessões antes de excluir o usuário. Perfis/endereços/aceites são removidos por cascade; snapshots de pedidos permanecem até o fim da obrigação de retenção e exigem anonimização/eliminação privilegiada posterior. Não marque como atendido antes de responder. Não há exclusão automática de comprovantes sujeitos a retenção.

## Desenvolvimento e deploy

`npm ci`, `npm run build`, `npm test`, `npm run dev` (porta 8090). Migração inicial em `supabase/migrations/`. Testes transacionais em `supabase/tests/delivery.sql`, com rollback integral. Não reaplique a migração inicial no banco já configurado.

Cloudflare Pages: branch `main`, diretório `public`, build `npm ci && npm run build`. Bundles gerados estão versionados, compatíveis também com o antigo build de SEO. Deploy direto: `npm run deploy` após autenticar com Wrangler. `public/backend-config.js` contém somente URL e chave publicável.

Validações: build, três testes de domínio, SEO, login real do proprietário e testes no Supabase cobrindo criptografia, propriedade, bloqueio de admin, preço adulterado, idempotência, cancelamento e estoque. Recuperação e confirmação por e-mail foram desativadas por solicitação do proprietário.

Referências: [Vault](https://supabase.com/docs/guides/database/vault), [ANPD — direitos](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados/direito-dos-titulares).
