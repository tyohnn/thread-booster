import { isActive } from '../domain/account.mjs';

/**
 * @param {{ registry: import('../ports/index.mjs').AccountRegistryPort }} deps
 */
export function createManageAccounts(deps) {
  const { registry } = deps;
  return {
    list() {
      return registry.list();
    },
    listActive() {
      return registry.list().filter(isActive);
    },
    add(handle, fields) {
      return registry.add(handle, fields);
    },
    deactivate(handle) {
      return registry.deactivate(handle);
    },
  };
}
