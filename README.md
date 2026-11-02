# ZKLeague

Bóveda para quienes tienen muchas cuentas de League of Legends: guarda el usuario y la
contraseña de cada una, y muestra su perfil (ícono, nivel) y su elo en **Solo/Q**, **Flex**
y **5v5** (Ranked 5s). Las cuentas se ordenan por Solo/Q → Flex → 5v5 → nivel.

Parte del entorno **ZK** · https://zkl.zakiumy.com

## Seguridad

Las credenciales se **cifran en el navegador**, así que el servidor nunca las ve en claro.

```
contraseña maestra ──PBKDF2-SHA256 (600.000 it., sal por usuario)──▶ masterKey
masterKey ──HKDF "zkl-auth"──▶ authKey   → se envía al servidor (que la vuelve a hashear con scrypt)
masterKey ──HKDF "zkl-enc"───▶ encKey    → nunca sale del navegador
vaultKey (AES-256 aleatoria) → se guarda en el servidor cifrada con encKey
cada cuenta {usuario, contraseña, notas} → AES-256-GCM con vaultKey
```

- Si se filtra la base de datos, las credenciales siguen cifradas. Para descifrarlas hay
  que adivinar la contraseña maestra de cada usuario, y cada intento cuesta 600.000 iteraciones de PBKDF2.
- **Si olvidas la contraseña maestra no hay recuperación.** Es la consecuencia de este diseño.
- Riot ID, servidor y rangos se guardan sin cifrar, porque el servidor necesita consultarlos.
- Sesión en cookie `httpOnly` + `Secure` + `SameSite=Strict` (prefijo `__Host-` en
  producción), comprobación de `Origin` en cada escritura, CSP estricta, rate limit en el
  login. La bóveda se bloquea tras 10 min sin actividad o al recargar la página.

## Desarrollo

```bash
cd backend
cp .env.example .env     # NODE_ENV=development, ALLOWED_ORIGIN=http://localhost:5173
npm install
npm run dev              # API en :3100 (o el PORT del .env)

cd ../frontend
npm install
npm run dev              # http://localhost:5173 (proxy /api → backend)
```

Si cambias `PORT`, ajusta también el `proxy` en `frontend/vite.config.js`.

Tests: `cd backend && npm test`. Cubren el flujo completo con cifrado real y un Riot simulado.

## Despliegue en el VPS (Debian + Nginx + PM2 + Let's Encrypt)

1. **DNS:** en Spaceship, crea un registro `A` con nombre `zkl` apuntando a la IP del VPS.
2. **Código:**
   ```bash
   sudo apt install -y build-essential sqlite3   # por si better-sqlite3 necesita compilar
   git clone https://github.com/ZakiumyI/ZKLeague.git ~/apps/ZKLeague
   cd ~/apps/ZKLeague
   cp backend/.env.example backend/.env && nano backend/.env   # SESSION_SECRET, RIOT_API_KEY
   chmod 600 backend/.env
   (cd backend && npm ci --omit=dev)
   (cd frontend && npm ci && npm run build)
   ```
3. **PM2:**
   ```bash
   pm2 start ecosystem.config.cjs && pm2 save
   curl http://127.0.0.1:3100/api/health    # {"ok":true}
   ```
4. **Nginx + HTTPS:**
   ```bash
   sudo cp deploy/nginx-zkl.conf /etc/nginx/sites-available/zkl.zakiumy.com
   sudo ln -s /etc/nginx/sites-available/zkl.zakiumy.com /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx -d zkl.zakiumy.com --redirect
   ```
5. Entra a https://zkl.zakiumy.com, crea tu bóveda y pon `REGISTRATION_OPEN=false` si
   aún no quieres más usuarios (`pm2 restart zkleague --update-env`).
6. **Backups:** `chmod +x deploy/*.sh` y añade `deploy/backup.sh` al cron.

Actualizar después: `./deploy/update.sh`.

### API key de Riot

La key de desarrollo **caduca cada 24 h**. Cuando caduca, las tarjetas muestran "La API key
de Riot es inválida o expiró", pero las credenciales siguen accesibles. Para renovarla,
edita `RIOT_API_KEY` en `backend/.env` y ejecuta `pm2 restart zkleague --update-env`. Para abrir
la app al público hay que registrarla en developer.riotgames.com y pedir una
*production key*.

### Ranked 5s (5v5)

Riot no documenta todavía el `queueType` de Ranked 5s. Si una cuenta tiene una cola
desconocida, aparece en su tarjeta con el nombre crudo. Ese nombre va en
`RIOT_QUEUE_5V5` para que se muestre como "5v5" y cuente en el orden.
