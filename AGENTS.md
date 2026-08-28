# Monorepo

We are using Turborepo with NPM (not pnpm) on Node 24.

## General

Be careful around making assumptions. If in doubt, ask the user for clarification.

Don't opt for band-aids without explicit consent. Always yield to the user before adding a workaround instead of a fix.

Never infer one fact from another that merely correlates with it today.

# Database

Schema changes go through generated migrations. Not `db:push`.

`npm run db:generate` writes a numbered SQL file into
`packages/schema/src/migrations`; commit it with the schema change that
produced it. `npm run db:migrate` applies whatever is pending and records it in
`drizzle.__drizzle_migrations`, so the same files produce the same schema
everywhere. Production runs exactly this, as a blocking init step: the server
does not start if it fails.

`db:push` is a different thing wearing the same coat. It diffs the schema
against whatever the live database currently holds and applies the difference
directly — no file to review, no ordering, no record of what ran, and when the
diff implies a drop, it drops. A dev database maintained that way is on a
different footing from production even when the two happen to agree, and the
first time they disagree there is nothing to compare.

The dev database is `jetlag` on `localhost:5432`, created by
`infra/docker/docker-compose.yml`.

# Typescript

Prefer an exported/inferred type instead of using unknown with `in` guards and `as` casts.

# React 19

Remember that React's reactivity lives at component boundaries.

Be liberal with component creation. If you find natural boundaries, split components into sub components. Again only if you find natural boundaries.

Skip forwardRef. `ref` is now a regular prop.

Prefer discriminated unions for component state.

Avoid any; prefer unknown.

Keep components small and focused.

Derive state, don't sync it. If a value can be computed from props or existing state, compute it during render instead of storing it in `useState` + `useEffect`.

Lift state only as far as needed.

Declare prop types in an interface (e.g., `interface ComponentNameProps { ... }).

`useEffect` is an escape hatch, not a default. Use it for synchronizing with external systems (subscriptions, DOM APIs, non-React libraries). Don't use it for event handling, data transformation, or reacting to user input — those belong in event handlers or render logic.

Memoize deliberately `useMemo`, `useCallback`, and `React.memo`. Use them when profiling justifies it or when referential stability is required.

Favor composition over configuration. Prefer children and render props over boolean flag props.

Colocate data fetching with its consumer. Use a dedicated data layer (React Query, loaders) rather than ad-hoc useEffect fetches.

Fetch data in the leaf that uses it, not in a parent that forwards it through props.

# React Router

Navigate with useNavigate/redirect; never window.location for in-app nav.

Use the generated Route.* types. Import from ./+types/<route-name> and type your exports with Route.LoaderArgs, Route.ActionArgs, Route.ComponentProps, Route.MetaArgs, etc.
