## Requirements

### Requirement: Login page
The app SHALL provide a login page at `/login` where users can sign in via email+PIN or via Google OAuth. The welcome screen MUST display both "登录" (email+PIN) and "通过 Google 登录" (OAuth) options.

#### Scenario: Successful login
- **WHEN** user enters valid email and PIN
- **THEN** they are authenticated and redirected to `/`

#### Scenario: Failed login
- **WHEN** user enters invalid credentials
- **THEN** an error message is displayed

#### Scenario: Google OAuth login
- **WHEN** user clicks "通过 Google 登录" on the welcome screen
- **THEN** the Google OAuth flow is initiated via Supabase

### Requirement: Signup page
The app SHALL provide a signup page at `/signup` where users enter email, PIN, name, emoji, and color to create an account.

#### Scenario: Successful signup
- **WHEN** user fills in all fields and submits
- **THEN** a Supabase auth account is created and a `users` table record is inserted with name, emoji, and color

### Requirement: Auth state management
The app SHALL use a React context (`AuthContext`) to provide the current user throughout the component tree. Auth state changes SHALL be listened to via `onAuthChange`. When a `SIGNED_OUT` event is received, the context MUST immediately set `user` to null and `profileCompleted` to null. When `checkProfileCompleted` fails due to network or auth errors, `profileCompleted` MUST remain null (not be set to false).

#### Scenario: Auth state propagation
- **WHEN** a user logs in or out
- **THEN** all components consuming `AuthContext` re-render with the updated user state

#### Scenario: Session expires while app is backgrounded
- **WHEN** the Supabase session token expires while the app is in a background tab, and the user returns or refreshes
- **THEN** the auth context SHALL detect the invalid session and set `user` to null and `profileCompleted` to null
- **AND** the user SHALL be redirected to the welcome screen, not the profile setup flow

#### Scenario: checkProfileCompleted network failure
- **WHEN** `checkProfileCompleted` fails due to a network or auth error
- **THEN** `profileCompleted` SHALL remain null (loading state), not be set to false

### Requirement: Protected routes
Routes `/` and `/split/:id` SHALL be protected. Unauthenticated users SHALL be redirected to `/login`, and they MUST remain on the initial welcome interface until an authentication action is initiated. They SHALL NOT be redirected to profile setup or other authenticated-only flows.

#### Scenario: Access protected route while logged out
- **WHEN** an unauthenticated user visits `/`
- **THEN** they are redirected to `/login`
- **AND** they see the initial welcome screen with login and signup options.

#### Scenario: Unauthenticated user visits login directly
- **WHEN** an unauthenticated user visits `/login` directly
- **THEN** they see the initial welcome screen with login and signup options.
- **AND** they are NOT redirected to the profile setup flow, regardless of any cached profile state.

### Requirement: Setup flow escape hatch
The profile setup flow (setup-welcome, setup-name, setup-emoji steps) SHALL always provide a way for the user to sign out and return to the welcome screen.

#### Scenario: User wants to exit setup flow
- **WHEN** user is on any setup step (setup-welcome, setup-name, setup-emoji)
- **THEN** a "退出登录" button or link SHALL be visible
- **AND** clicking it SHALL sign the user out and return them to the welcome screen

### Requirement: Session validation before setup entry
Before entering the profile setup flow, the app SHALL verify the session is valid by calling `supabase.auth.getUser()`. If the session is invalid, the user SHALL be signed out and returned to the welcome screen.

#### Scenario: Stale session triggers setup flow
- **WHEN** a stale session causes `profileCompleted` to be false
- **AND** the app would normally enter the setup flow
- **THEN** it SHALL first verify the session with a server call
- **AND** if invalid, sign out and redirect to welcome instead of entering setup
