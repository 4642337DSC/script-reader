import './ui/styles.css';
import { render } from 'preact';
import { App } from './ui/App';
import { openStore } from './storage/db';
import { runSync } from './sync/sync';

openStore().then((store) => {
  render(<App store={store} sync={(i) => runSync(store, i)} />, document.getElementById('app')!);
});
