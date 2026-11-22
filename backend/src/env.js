import { defineEnvVars } from '@sveltejs/kit/env';

// SvelteKit 3: only variables declared here are exposed via $app/env/private / $app/env/public.
export const variables = defineEnvVars({
	SUPABASE_URL: { description: 'Supabase project URL' },
	SUPABASE_PUBLISHABLE_KEY: { description: 'Supabase publishable (anon) key — RLS applies' }
});
