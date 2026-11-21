import './styles/main.css';
import './styles/print.css';
import { startApp } from './ui/app';

// Your songs live in songs/ (git-ignored, personal). Every songs/*.gsong is
// bundled at build time and hot-reloaded in dev. With no songs of your own,
// the public-domain examples are shown instead.
const mine = import.meta.glob('/songs/*.gsong', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const examples = import.meta.glob('/examples/*.gsong', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
// Guitar Pro files (.gp/.gp5/.gpx…) in songs/ are full tabs, drawn with alphaTab.
const gp = import.meta.glob('/songs/*.{gp,gp3,gp4,gp5,gpx}', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const files = Object.keys(mine).length || Object.keys(gp).length ? mine : examples;

startApp(document.getElementById('app')!, files, gp);
