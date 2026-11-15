import './ui/styles.css';
import { render } from 'preact';
import { App } from './ui/App';
import { openStore } from './storage/db';

openStore().then((store) => {
  render(<App store={store} />, document.getElementById('app')!);
});
