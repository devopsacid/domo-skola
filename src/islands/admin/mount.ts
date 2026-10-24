/** Mounts the admin app (client-only; the page holds an empty `data-island="admin"` element). */
import AdminApp from './AdminApp';
import { mountIsland } from '../mount';

mountIsland('[data-island="admin"]', AdminApp, 'render');
