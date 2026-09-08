# PROJEM Vagas — V1 Mobile First

Versão redesenhada para uma experiência mobile-first em uma única coluna.

## Interface
- Fundo escuro
- Texto branco
- Cabeçalho simples
- Uma pergunta por step
- Transições curtas entre etapas
- Opções Sim/Não avançam automaticamente
- Última etapa com botão "Finalizar candidatura"

## Steps
1. Nome completo
2. Idade
3. Cidade
4. WhatsApp + e-mail opcional
5. Experiência com vendas
6. CNH B
7. Veículo próprio
8. Notebook
9. CNPJ ativo
10. Currículo ou "Conte-nos mais sobre você"

## Qualificação
Lead qualificado quando:
- idade >= 18
- experiência com vendas = sim
- CNH B = sim
- veículo próprio = sim

Somente lead qualificado é enviado ao webhook do Make.

## Validações
- Nome obrigatório, mínimo de 2 letras, apenas letras e espaços.
- WhatsApp obrigatório: celular brasileiro com DDD válido + 9 dígitos; normalizado para 55DD9XXXXXXXX.
- E-mail opcional, mas validado quando preenchido e normalizado em minúsculas.
- Validação duplicada no frontend e backend.

## Make
Webhook configurado no backend por variável de ambiente `MAKE_WEBHOOK_URL`. Leads não qualificados não são enviados. O Make recebe `payload_json`, campos achatados, `telegram_message` pronta e o arquivo de currículo quando houver.

## Deploy
Produção vinculada ao projeto Netlify `vagas-projem-envio`.

Variável de ambiente `MAKE_WEBHOOK_URL` confirmada manualmente no Netlify em 2026-09-08.
