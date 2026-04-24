declare module "katex/contrib/auto-render" {
  interface AutoRenderDelimiter {
    left: string;
    right: string;
    display: boolean;
  }
  interface AutoRenderOptions {
    delimiters?: AutoRenderDelimiter[];
    ignoredTags?: string[];
    ignoredClasses?: string[];
    throwOnError?: boolean;
    errorCallback?: (msg: string, err: Error) => void;
    macros?: Record<string, string>;
    trust?: boolean | ((ctx: unknown) => boolean);
    strict?: boolean | string | ((errorCode: string) => string);
  }
  export default function renderMathInElement(
    elem: HTMLElement,
    options?: AutoRenderOptions,
  ): void;
}
