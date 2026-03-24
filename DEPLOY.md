# Deploy to Vercel

This file contains the exact commands used to deploy this project to Vercel and the production URL.

## Commands

1. Login to Vercel (interactive):

```powershell
npx vercel login
npx vercel whoami
```

2. Deploy to production:

```powershell
cd "D:/APLICATIVOS REALIZADOS/app-marcelo-auditoria"
npx vercel --prod
```

3. Non-interactive (token):

```powershell
$env:VERCEL_TOKEN="SEU_TOKEN"
cd "D:/APLICATIVOS REALIZADOS/app-marcelo-auditoria"
npx vercel --prod --token $env:VERCEL_TOKEN
```

## Production URL

https://app-marcelo-auditoria-czld9dyf0.vercel.app
