import { writeFile, mkdir } from 'node:fs/promises';
const sources = [
 ['awakening.mp3','https://www.scottbuckley.com.au/wp-content/audio/sb_awakening.mp3'],
 ['call-to-adventure.mp3','https://www.scottbuckley.com.au/library/wp-content/uploads/2023/01/CallToAdventure.mp3'],
 ['horizons.mp3','https://www.scottbuckley.com.au/library/wp-content/uploads/2020/02/sb_horizons.mp3'],
 ['the-long-dark.mp3','https://www.scottbuckley.com.au/library/wp-content/uploads/2023/01/TheLongDark.mp3'],
 ['kenney-rpg.zip','https://kenney.nl/media/pages/assets/rpg-audio/8e99002d76-1677590336/kenney_rpg-audio.zip'],
 ['kenney-impact.zip','https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip'],
];
await mkdir('trailer/audio', { recursive:true });
const results = await Promise.allSettled(sources.map(async ([name,url]) => {
 const r = await fetch(url); if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
 const bytes = Buffer.from(await r.arrayBuffer()); if(bytes.length < 10000) throw new Error(`Unexpected response: ${name}`);
 await writeFile(`trailer/audio/${name}`,bytes); console.log(`${name}: ${bytes.length} bytes`);
}));
for (const r of results) if(r.status==='rejected') {console.error(r.reason.message); process.exitCode=1;}
