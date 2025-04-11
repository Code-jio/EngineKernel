export interface IPlugin {
  name: string;
  initialize: () => void;
  uninstall: () => void;
}