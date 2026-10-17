# Getting a Google Client ID / Client Secret

Instructions for creating **Google** OAuth keys and putting them into `.env` to enable Martial Cutie's sign-in feature.

> **You are not required to do this.** Without keys the game is still fully playable — you simply cannot sign in or sync progress to an account.

> **Note:** Facebook login **has been removed** from the project. The endpoint `/api/auth/facebook/login` now returns `400 unknown_provider`, and the `FACEBOOK_CLIENT_ID`/`FACEBOOK_CLIENT_SECRET` variables no longer do anything — leftovers in `.env` are ignored.

---

## 0. Values to fill in — exactly per the code

The redirect URI is decided by the `FRONTEND_URL` variable (or `BE_PUBLIC_URL` when running Docker). It **must match character for character** what you register in Google Console.

| How you run it | Game port | Registered redirect URI |
| --- | --- | --- |
| Docker (`docker compose up --build`) | 5190 (nginx `fr`) | `http://localhost:5190/api/auth/google/callback` |
| Local dev (`pnpm dev` + `pnpm dev:be`) | 5190 (Vite) | `http://localhost:5190/api/auth/google/callback` |
| Calling the API directly only | 8000 (`be` container) | `http://localhost:8000/api/auth/google/callback` |

Because both main ways of running use **port 5190**, you only need to register **one** URI. The 8000 row is optional — needed only if you call the backend container's `/api` directly (for example opening `http://localhost:8000/api/docs` and signing in from there).

The backend uses these official endpoints (nothing to configure, just for reference when debugging):

| Step | URL |
| --- | --- |
| Authorisation | `accounts.google.com/o/oauth2/v2/auth` |
| Token exchange | `oauth2.googleapis.com/token` |
| Profile | `openidconnect.googleapis.com/v1/userinfo` |
| Scopes requested | `openid email profile` |

Information obtained: **the user id (`sub`), name, email, avatar**. No other permission to read Google data is requested.

---

## 1. Create a project

1. Open https://console.cloud.google.com/ → sign in with your Google account.
2. Top left, click the project selector → **New project**.
3. Name it (for example `martial-cutie`) → **Create** → wait a few seconds → select the project you just created.

> You do not need to enable any API and **you do not need a payment card**. Sign-in only uses OpenID Connect and never calls a paid API.

## 2. Configure the consent screen (OAuth consent screen)

Google requires this step **before** any key can be created. The new interface calls it **Google Auth Platform**; if your console shows the old version, the equivalent path is **APIs & Services → OAuth consent screen**.

1. Go to https://console.cloud.google.com/auth/overview → click **Get started** (or **Bắt đầu**).
2. **App information**
   - *App name*: `Martial Cutie`
   - *User support email*: your email
3. **Audience** — choose **External**. Choosing *Internal* only works for accounts inside a Google Workspace organisation.
4. **Contact information**: enter your email.
5. Tick to accept the terms → **Create**.
6. Go to **Data access** (or *Scopes*) → **Add or remove scopes** → add the following 3 scopes, then **Update**:
   - `openid`
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`

   These are all **non-sensitive** scopes, so the application **does not have to go through Google's review process**.
7. Go to **Audience** → the **Test users** section → **Add users** → add **the Gmail address you will use to try signing in**.

⚠️ **Most important:** while the application is in the *Testing* state, **only accounts on the Test users list can sign in**. Everyone else is blocked with an `access_denied` error. This is the most common error — if you test with a different Gmail, add it to this list.

## 3. Create a Client ID

1. Go to https://console.cloud.google.com/auth/clients → **Create client**.
2. *Application type*: choose **Web application**. (❌ Do not choose *Desktop app* or *SPA* — they cannot use a client secret the way this backend needs.)
3. *Name*: `Martial Cutie Web`.
4. **Authorized JavaScript origins** — add the origin, **with no path**:
   ```
   http://localhost:5190
   ```
   (add `http://localhost:8000` only if you want to call the backend container's API directly)
5. **Authorized redirect URIs** → **Add URI** → paste exactly:
   ```
   http://localhost:5190/api/auth/google/callback
   ```
   This URI covers both Docker and local dev — both serve the game on port 5190. Optionally, if you call the backend port directly:
   ```
   http://localhost:8000/api/auth/google/callback
   ```
6. **Create**.
7. The dialog shows the **Client ID** and **Client secret**:
   - **Client ID** looks like `388199177066-xxxxxxxxxxxxxxxx.apps.googleusercontent.com`
   - **Client secret** looks like `GOCSPX-xxxxxxxxxxxxxxxxxxxx`

⚠️ **The client secret is shown in full only once.** Copy it immediately. If you lose it or suspect it leaked: go back to the clients list → **Add secret** to create a new one, then delete the old one.

## 4. Fill in .env

```bash
GOOGLE_CLIENT_ID=388199177066-xxxxxxxxxxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxx
```

You need **both**. With either one missing the sign-in button **does not appear** in the dialog — that is deliberate, to avoid showing a button that then reports an error when clicked.

---

## 5. Forced sign-in mode (`AUTO_LOGIN`)

By default (`AUTO_LOGIN=false`) the player **enters the game straight away**, and clicks **Đăng nhập** when they want to sync progress.

If you want **signing in to be required before playing**:

```bash
AUTO_LOGIN=true
```

How it works:

- The backend returns this flag in `/api/auth/session`; it is **true only when the Google keys are fully configured**.
- Once the frontend has finished checking the session and finds nobody signed in, it redirects straight to the Google account chooser.
- After a successful sign-in the user returns to the game and **is not redirected again**.

Two things to know:

- **Without Google keys this flag has no effect** — the game is still played anonymously as usual. That way turning on `AUTO_LOGIN=true` and forgetting to fill in the keys does not kill the game.
- There is a **loop guard** in `sessionStorage`: once a tab has attempted auto sign-in it does not try again. If sign-in fails, the user sees an error message and can click **Đăng nhập** manually.
- To leave forced mode: change `AUTO_LOGIN=false` and restart the backend.

---

## 6. Fill in the `.env` file and run

```bash
cp .env.example .env
```

Open `.env` and fill in at least:

```bash
# Required — generate a key with the command below
JWT_SECRET=<random key>

# Google
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Origin of the redirect URI — must match what you registered
FRONTEND_URL=http://localhost:5190
```

Generate `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

> `JWT_SECRET` is the key that signs the sign-in session cookie. The backend **refuses to start** if the key is empty, equals the sample value in `.env.example`, or is shorter than 32 characters — so you never accidentally run production with a key anybody can guess.

After editing `.env`, **restart the backend** (environment variables are only read at startup).

---

## 7. Checking that it is right

### Step 1 — Has the backend picked up the keys?

```bash
curl http://localhost:8000/api/health
```

Expected result:

```json
{"status":"ok","environment":"development","providers":["google"]}
```

- `"providers":[]` → the key pair is not filled in completely, or the backend **has not been restarted**.

### Step 2 — Is the authorisation URL correct?

```bash
curl -s "http://localhost:8000/api/auth/google/login" -o /dev/null -D - | Select-String -Pattern "location"
```

In the returned URL, check the two important parameters:

- `client_id` = your Client ID (starts with `388199177066-`…)
- `redirect_uri` = `http%3A%2F%2Flocalhost%3A5190%2Fapi%2Fauth%2Fgoogle%2Fcallback`

If `redirect_uri` does not match what you registered in Google Console, fix `FRONTEND_URL` in `.env`.

### Step 2 — Check whether Google accepts the redirect URI

The `redirect_uri_mismatch` error occurs when the URI the app sends is **not** on the registered list. Wait 1–2 minutes after saving in the console, then test with exactly the URL the app will use:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  "http://localhost:8000/api/auth/google/login"
```

But the surest way is to open the authorisation URL directly in a browser and see what Google says:

```
https://accounts.google.com/o/oauth2/v2/auth?client_id=<CLIENT_ID>&redirect_uri=<URI_ESCAPED>&response_type=code&scope=openid+email+profile&prompt=none
```

- If Google shows **"Access blocked: This app's request is invalid"** with `Error 400: redirect_uri_mismatch` → that URI is **not registered**.
- If Google goes straight to the sign-in/account-chooser page → the URI **is valid**.

> Tip for probing several URIs at once: use `prompt=none` so Google asks nothing, then look for the sentence `You can't sign in because this app sent an invalid request` in the returned page content. The error page contains that sentence; the sign-in page does not. ⚠️ Do not just search the HTML for the string `redirect_uri_mismatch` — the error page embeds that string in its JavaScript, which easily gives a false positive.

### Step 3 — Try signing in

1. Open http://localhost:5190 (if `AUTO_LOGIN=true` the browser jumps to Google by itself).
2. Choose an account **already on the Test users list** → agree.
3. Back in the game, the top bar shows the **name + avatar** and the line **Đã đồng bộ**.

---

## 8. Common errors

| Symptom | Cause & fix |
| --- | --- |
| The dialog says *"Máy chủ chưa được cấu hình đăng nhập"* | `/api/health` returns `providers: []`. Fill in `.env` then **restart the backend**. |
| `Error 403: access_denied` | The account signing in is not on the **Test users** list. Add it (section 2 step 7), or click **Publish app** in the *Audience* section. |
| `Error 400: redirect_uri_mismatch` | The URI does not match. Compare **character by character** with `http://localhost:5190/api/auth/google/callback`. Google treats `localhost` and `127.0.0.1` as **two different URIs**, and a registered URI **must not end with `/`**. Also check `FRONTEND_URL` in `.env` — the port in that variable must match the registered port. After saving in the console you must wait 1–2 minutes and retry; if it still fails, use the probing method in section 7 step 2 to find out for sure which URI Google received. |
| Pasting a URI into *JavaScript origins* instead of *redirect URIs* | Google reports `invalid_request` when saving. `JavaScript origins` only accepts an **origin** (`http://localhost:5190`), not a path. |
| `Error 400: invalid_client` | Wrong **Client Secret** (a character was missed when pasting), or the secret was deleted/rotated. Create a new secret in the console. |
| Coming back to the game but it says *"Phiên đăng nhập không hợp lệ hoặc đã hết hạn"* | The anti-forgery `state` cookie was lost. Check that you are not blocking cookies for `localhost`. |
| Clicking sign in does not navigate | The backend is not running, or the Vite proxy is not working. Check `curl http://localhost:8000/api/health` and look at the `pnpm dev` terminal. |
| `AUTO_LOGIN=true` but the game opens normally | The Google keys are not fully configured (the flag is disabled), or this tab has already attempted auto sign-in. Open a new tab or click **Đăng nhập** manually. |
| After auto sign-in it keeps coming back to the sign-in page | The loop guard only lives inside one tab. Check whether the backend can exchange the code for a token: `docker compose logs -f be` or the terminal running `pnpm dev:be`. |

### Seeing detailed logs

- **Backend dev**: logs appear straight in the terminal running `pnpm dev:be`.
- **Docker**: `docker compose logs -f api`.
- **Browser**: open DevTools → the **Network** tab, look at the `/api/auth/google/callback` request to see which `error` parameter Google returned.

---

## 9. Real deployment (production)

1. Change `FRONTEND_URL` to the real domain, for example `https://game.example.com`, then **register the redirect URI again** in Google Console:
   ```
   https://game.example.com/api/auth/google/callback
   ```
   Google requires **HTTPS** for a real domain (localhost is the exception for development).

2. Set `COOKIE_SECURE=true` in `.env`. Mandatory — without this step the session cookie can be sent over unencrypted HTTP.

3. Generate a **new** `JWT_SECRET`, completely different from the dev key. Changing the key invalidates every signed-in session (users must sign in again) — that is the desired behaviour.

4. Let people outside the Test users list sign in: go to **Audience** → **Publish app**. Since only 3 non-sensitive scopes are used, review is usually not required.

5. Consider setting `AUTO_LOGIN=false` in production if you want visitors to be able to see the game before deciding to sign in.
