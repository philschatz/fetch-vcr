declare module 'fetch-vcr' {
  function fetchVCR(url: string, args: object): Promise<any>;

  interface Config {
    mode?: 'playback' | 'cache' | 'record' | 'erase';
    fixturePath?: string;
    ignoreUrls?: string[];
    headerBlacklist?: string[]
  }
  namespace fetchVCR {
    function configure(config: Config): void;
    function loadFile(root: string, filename: string): Promise<string>;
    function saveFile(root: string, filename: string, buffer: string): Promise<'fetch-saved'>;
    function getCalled(): void;
    function clearCalled(): void;
  }
  export default fetchVCR;
}
