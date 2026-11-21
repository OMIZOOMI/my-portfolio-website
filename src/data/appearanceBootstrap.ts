import { APPEARANCE_STORAGE_KEY } from "./wallpapers";

/** Apply the existing theme preference before the new HTML reading surfaces paint. No storage writes. */
export const APPEARANCE_BOOTSTRAP = `(function(){var dark=true;try{var parsed=JSON.parse(localStorage.getItem(${JSON.stringify(APPEARANCE_STORAGE_KEY)})||"null");var data=parsed&&parsed.state!=null?parsed.state:parsed;dark=!(data&&data.theme==="light");}catch{}document.documentElement.classList.toggle("dark",dark);document.documentElement.dataset.theme=dark?"dark":"light";})();`;
