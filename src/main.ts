import './styles/main.css';
import './styles/print.css';
import { startApp } from './ui/app';

// Every songs/*.gsong is bundled at build time (and hot-reloaded in dev).
const files = import.meta.glob('/songs/*.gsong', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

startApp(document.getElementById('app')!, files);
