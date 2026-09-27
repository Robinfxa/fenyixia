## MODIFIED Requirements

### Requirement: Login page
The app SHALL provide a login page at `/login` where users can sign in via email+PIN or via Google OAuth. The welcome screen MUST display both "登录" (email+PIN) and "通过 Google 登录" (OAuth) options.

#### Scenario: Successful login
- **WHEN** user enters valid email and PIN
- **THEN** they are authenticated by the backend service, issued a JWT session, and redirected to `/`

#### Scenario: Failed login
- **WHEN** user enters invalid credentials
- **THEN** an error message is displayed

#### Scenario: Google OAuth login
- **WHEN** user clicks "通过 Google 登录" on the welcome screen
- **THEN** the Google OAuth flow is initiated via backend OAuth endpoints

### Requirement: Signup page
The app SHALL provide a signup page at `/signup` where users enter email, PIN, name, emoji, and color to create an account.

#### Scenario: Successful signup
- **WHEN** user fills in all fields and submits
- **THEN** an account record is inserted in the backend DuckDB `users` table with name, emoji, and color, and an active session token is issued

### Requirement: Session validation before setup entry
Before entering the profile setup flow, the app SHALL verify the session is valid by calling `/api/auth/me`. If the session is invalid, the user SHALL be signed out and returned to the welcome screen.

#### Scenario: Stale session triggers setup flow
- **WHEN** a stale session causes `profileCompleted` to be false
- **AND** the app would normally enter the setup flow
- **THEN** it SHALL first verify the session with a server call to `/api/auth/me`
- **AND** if invalid, sign out and redirect to welcome instead of entering setup
