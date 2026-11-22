<script>
	let { data } = $props();
</script>

<h1>Supabase check</h1>
{#if data.error}
	<p style="color: red">Error: {data.error}</p>
{:else}
	<p>{data.exercises.length} exercises loaded</p>
	<pre>{JSON.stringify(data.exercises, null, 2)}</pre>
{/if}
