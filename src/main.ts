import './styles/main.css';
import './styles/print.css';
import { startApp } from './ui/app';

// Your songs live in songs/ (git-ignored, personal). Every songs/*.gsong is
// bundled at build time and hot-reloaded in dev. With no songs of your own,
// the public-domain examples are shown instead.
const mine = import.meta.glob('/songs/*.gsong', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const examples = import.meta.glob('/examples/*.gsong', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const files = Object.keys(mine).length ? mine : examples;

startApp(document.getElementById('app')!, files);
