# Monorepo

We are using Turborepo with NPM (not pnpm) on Node 24.

## General

Be careful around making assumptions. If in doubt, ask the user for clarification.

Don't opt for band-aids without explicit consent. Always yield to the user before adding a workaround instead of a fix.

Never infer one fact from another that merely correlates with it today.

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
