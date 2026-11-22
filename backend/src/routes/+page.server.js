import { supabase } from '#lib/supabaseClient.js';

export async function load() {
	const { data, error } = await supabase.from('exercises').select();
	if (error) console.error('Supabase error:', error);
	return {
		exercises: data ?? [],
		error: error?.message ?? null
	};
}
