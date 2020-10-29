// change: using 'toDataURL' method to toBlob() and break the 2m size limits in DataUrl
// ref: https://stackoverflow.com/questions/695151/data-protocol-url-size-limitations/41755526#41755526

(function() {
    const out$ = typeof exports != 'undefined' && exports || typeof define != 'undefined' && {} || this || window;
    if (typeof define !== 'undefined') define('save-svg-as-png', [], () => out$);
    out$.default = out$;

    const xmlNs = 'http://www.w3.org/2000/xmlns/';
    const xhtmlNs = 'http://www.w3.org/1999/xhtml';
    const svgNs = 'http://www.w3.org/2000/svg';
    const doctype = '<?xml version="1.0" standalone="no"?><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd" [<!ENTITY nbsp "&#160;">]>';
    const urlRegex = /url\(["']?(.+?)["']?\)/;
    const fontFormats = {
        woff2: 'font/woff2',
        woff: 'font/woff',
        otf: 'application/x-font-opentype',
        ttf: 'application/x-font-ttf',
        eot: 'application/vnd.ms-fontobject',
        sfnt: 'application/font-sfnt',
        svg: 'image/svg+xml'
    };

    // integrated & modified code from fileSaver.js
    // The one and only way of getting global scope in all environments
    // https://stackoverflow.com/q/3277182/1008999
    let _global = typeof window === 'object' && window.window === window
        ? window : typeof self === 'object' && self.self === self
            ? self : typeof global === 'object' && global.global === global
                ? global
                : this;

    function bom (blob, opts) {
        if (typeof opts === 'undefined') {
            opts = { autoBom: false };
        }
        else if (typeof opts !== 'object') {
            console.warn('Deprecated: Expected third argument to be a object')
            opts = { autoBom: !opts };
        }

        // prepend BOM for UTF-8 XML and text/* types (including HTML)
        // note: your browser will automatically convert UTF-16 U+FEFF to EF BB BF
        if (opts.autoBom && /^\s*(?:text\/\S*|application\/xml|\S*\/\S*\+xml)\s*;.*charset\s*=\s*utf-8/i.test(blob.type)) {
            return new Blob([String.fromCharCode(0xFEFF), blob], { type: blob.type });
        }
        return blob;
    }

    function download (url, name, opts) {
        let xhr = new XMLHttpRequest();
        xhr.open('GET', url);
        xhr.responseType = 'blob';
        xhr.onload = function () {
            saveAs(xhr.response, name, opts);
        }
        xhr.onerror = function () {
            console.error('could not download file');
        }
        xhr.send();
    }

    function corsEnabled (url) {
        let xhr = new XMLHttpRequest();
        // use sync to avoid popup blocker
        xhr.open('HEAD', url, false);
        try {
            xhr.send();
        } catch (e) {}
        return xhr.status >= 200 && xhr.status <= 299;
    }

    // `a.click()` doesn't work for all browsers (#465)
    function click (node) {
        try {
            node.dispatchEvent(new MouseEvent('click'));
        } catch (e) {
            let evt = document.createEvent('MouseEvents');
            evt.initMouseEvent('click', true, true, window, 0, 0, 0, 80,
                20, false, false, false, false, 0, null)
            node.dispatchEvent(evt);
        }
    }

    // shared by some methods
    const autoClean = (link, opts) => {
        // clean resources when click to download
        if (opts && opts.autoClearObjectURL) {
            link.onclick = () => requestAnimationFrame(() => URL.revokeObjectURL(link.href));
        }
    }

    // save file method 1
    function saveAsOpt1 (blob, name, opts) {
        let URL = _global.URL || _global.webkitURL;
        let a = document.createElement('a');
        name = name || blob.name || 'download';

        a.download = name;
        a.rel = 'noopener' // tabnabbing;

        if (typeof blob === 'string') {
            // Support regular links
            a.href = blob;
            autoClean(a, opts);

            if (a.origin !== location.origin) {
                corsEnabled(a.href)
                    ? download(blob, name, opts)
                    : click(a, a.target = '_blank');
            } else {
                click(a);
            }
        } else {
            // Support blobs
            a.href = URL.createObjectURL(blob);
            a.onclick = () => requestAnimationFrame(() => URL.revokeObjectURL(a.href));
            // setTimeout(function () { URL.revokeObjectURL(a.href) }, 4E4); // 40s
            setTimeout(function () { click(a) }, 0);
        }
    }

    // save file method 2
    function saveAsOpt2 (blob, name, opts) {
        name = name || blob.name || 'download';

        if (typeof blob === 'string') {
            if (corsEnabled(blob)) {
                download(blob, name, opts);
            } else {
                let a = document.createElement('a');
                a.href = blob;
                a.target = '_blank';
                autoClean(a, opts);
                setTimeout(function () { click(a) });
            }
        } else {
            navigator.msSaveOrOpenBlob(bom(blob, opts), name);
        }
    }

    // save file method 2
    function saveAsOpt3 (blob, name, opts, popup) {
        // Open a popup immediately do go around popup blocker
        // Mostly only available on user interaction and the fileReader is async so...
        popup = popup || open('', '_blank');
        if (popup) {
            popup.document.title =
                popup.document.body.innerText = 'downloading...';
        }

        if (typeof blob === 'string') {
            if (opts && opts.autoClearObjectURL) {
                setTimeout(function () { URL.revokeObjectURL(blob) }, 4E4); // 40s
            }
            return download(blob, name, opts);
        }

        let force = blob.type === 'application/octet-stream';
        let isSafari = /constructor/i.test(_global.HTMLElement) || _global.safari;
        let isChromeIOS = /CriOS\/[\d]+/.test(navigator.userAgent);

        if ((isChromeIOS || (force && isSafari) || isMacOSWebView) && typeof FileReader !== 'undefined') {
            // Safari doesn't allow downloading of blob URLs
            let reader = new FileReader();
            reader.onloadend = function () {
                let url = reader.result;
                url = isChromeIOS ? url : url.replace(/^data:[^;]*;/, 'data:attachment/file;');
                if (popup) {
                    popup.location.href = url;
                }
                else {
                    location = url
                }
                popup = null; // reverse-tabnabbing #460
            }
            reader.readAsDataURL(blob);
        } else {
            let URL = _global.URL || _global.webkitURL;
            let url = URL.createObjectURL(blob);
            if (popup) {
                popup.location = url;
            }
            else {
                location.href = url;
            }
            popup = null; // reverse-tabnabbing #460
            setTimeout(function () { URL.revokeObjectURL(url) }, 4E4); // 40s
        }
    }
    // Detect WebView inside a native macOS app by ruling out all browsers
    // We just need to check for 'Safari' because all other browsers (besides Firefox) include that too
    // https://www.whatismybrowser.com/guides/the-latest-user-agent/macos
    let isMacOSWebView = /Macintosh/.test(navigator.userAgent) && /AppleWebKit/.test(navigator.userAgent) && !/Safari/.test(navigator.userAgent);

    // global method define
    let saveAs = _global.saveAs || (
        // probably in some web worker
        (typeof window !== 'object' || window !== _global)
            ? function saveAs () { /* noop */ }
            // Use download attribute first if possible (#193 Lumia mobile) unless this is a macOS WebView
            : ('download' in HTMLAnchorElement.prototype && !isMacOSWebView)
            ? saveAsOpt1
            // Use msSaveOrOpenBlob as a second approach
            : 'msSaveOrOpenBlob' in navigator
                ? saveAsOpt2
                // Fallback to using FileReader and a popup
                : saveAsOpt3
    )

    // export
    _global.saveAs = saveAs.saveAs = saveAs;
    out$.saveAs = _global.saveAs;

    const isElement = obj => obj instanceof HTMLElement || obj instanceof SVGElement;
    const requireDomNode = el => {
        if (!isElement(el)) throw new Error(`an HTMLElement or SVGElement is required; got ${el}`);
    };
    const requireDomNodePromise = el =>
        new Promise((resolve, reject) => {
            if (isElement(el)) resolve(el)
            else reject(new Error(`an HTMLElement or SVGElement is required; got ${el}`));
        })
    const isExternal = url => url && url.lastIndexOf('http',0) === 0 && url.lastIndexOf(window.location.host) === -1;

    const getFontMimeTypeFromUrl = fontUrl => {
        const formats = Object.keys(fontFormats)
            .filter(extension => fontUrl.indexOf(`.${extension}`) > 0)
            .map(extension => fontFormats[extension]);
        if (formats) return formats[0];
        console.error(`Unknown font format for ${fontUrl}. Fonts may not be working correctly.`);
        return 'application/octet-stream';
    };

    const arrayBufferToBase64 = buffer => {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        return window.btoa(binary);
    }

    const getDimension = (el, clone, dim) => {
        const v =
            (el.viewBox && el.viewBox.baseVal && el.viewBox.baseVal[dim]) ||
            (clone.getAttribute(dim) !== null && !clone.getAttribute(dim).match(/%$/) && parseInt(clone.getAttribute(dim))) ||
            el.getBoundingClientRect()[dim] ||
            parseInt(clone.style[dim]) ||
            parseInt(window.getComputedStyle(el).getPropertyValue(dim));
        return typeof v === 'undefined' || v === null || isNaN(parseFloat(v)) ? 0 : v;
    };

    const getDimensions = (el, clone, width, height) => {
        if (el.tagName === 'svg') return {
            width: width || getDimension(el, clone, 'width'),
            height: height || getDimension(el, clone, 'height')
        };
        else if (el.getBBox) {
            const {x, y, width, height} = el.getBBox();
            return {
                width: x + width,
                height: y + height
            };
        }
    };

    const reEncode = data =>
        decodeURIComponent(
            encodeURIComponent(data)
                .replace(/%([0-9A-F]{2})/g, (match, p1) => {
                    const c = String.fromCharCode(`0x${p1}`);
                    return c === '%' ? '%25' : c;
                })
        );

    const uriToBlob = uri => {
        const byteString = window.atob(uri.split(',')[1]);
        const mimeString = uri.split(',')[0].split(':')[1].split(';')[0]
        const buffer = new ArrayBuffer(byteString.length);
        const intArray = new Uint8Array(buffer);
        for (let i = 0; i < byteString.length; i++) {
            intArray[i] = byteString.charCodeAt(i);
        }
        return new Blob([buffer], {type: mimeString});
    };

    const query = (el, selector) => {
        if (!selector) return;
        try {
            return el.querySelector(selector) || el.parentNode && el.parentNode.querySelector(selector);
        } catch(err) {
            console.warn(`Invalid CSS selector "${selector}"`, err);
        }
    };

    const detectCssFont = (rule, href) => {
        // Match CSS font-face rules to external links.
        // @font-face {
        //   src: local('Abel'), url(https://fonts.gstatic.com/s/abel/v6/UzN-iejR1VoXU2Oc-7LsbvesZW2xOQ-xsNqO47m55DA.woff2);
        // }
        const match = rule.cssText.match(urlRegex);
        const url = (match && match[1]) || '';
        if (!url || url.match(/^data:/) || url === 'about:blank') return;
        const fullUrl =
            url.startsWith('../') ? `${href}/../${url}`
                : url.startsWith('./') ? `${href}/.${url}`
                : url;
        return {
            text: rule.cssText,
            format: getFontMimeTypeFromUrl(fullUrl),
            url: fullUrl
        };
    };

    const inlineImages = el => Promise.all(
        Array.from(el.querySelectorAll('image')).map(image => {
            let href = image.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || image.getAttribute('href');
            if (!href) return Promise.resolve(null);
            if (isExternal(href)) {
                href += (href.indexOf('?') === -1 ? '?' : '&') + 't=' + new Date().valueOf();
            }
            return new Promise((resolve, reject) => {
                const canvas = document.createElement('canvas');
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.src = href;
                img.onerror = () => reject(new Error(`Could not load ${href}`));
                img.onload = () => {
                    canvas.width = img.width;
                    canvas.height = img.height;
                    canvas.getContext('2d').drawImage(img, 0, 0);
                    image.setAttributeNS('http://www.w3.org/1999/xlink', 'href', canvas.toDataURL('image/png'));
                    resolve(true);
                };
            });
        })
    );

    const cachedFonts = {};
    const inlineFonts = fonts => Promise.all(
        fonts.map(font =>
            new Promise((resolve, reject) => {
                if (cachedFonts[font.url]) return resolve(cachedFonts[font.url]);

                const req = new XMLHttpRequest();
                req.addEventListener('load', () => {
                    // TODO: it may also be worth it to wait until fonts are fully loaded before
                    // attempting to rasterize them. (e.g. use https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet)
                    const fontInBase64 = arrayBufferToBase64(req.response);
                    const fontUri = font.text.replace(urlRegex, `url("data:${font.format};base64,${fontInBase64}")`)+'\n';
                    cachedFonts[font.url] = fontUri;
                    resolve(fontUri);
                });
                req.addEventListener('error', e => {
                    console.warn(`Failed to load font from: ${font.url}`, e);
                    cachedFonts[font.url] = null;
                    resolve(null);
                });
                req.addEventListener('abort', e => {
                    console.warn(`Aborted loading font from: ${font.url}`, e);
                    resolve(null);
                });
                req.open('GET', font.url);
                req.responseType = 'arraybuffer';
                req.send();
            })
        )
    ).then(fontCss => fontCss.filter(x => x).join(''));

    let cachedRules = null;
    const styleSheetRules = () => {
        if (cachedRules) return cachedRules;
        return cachedRules = Array.from(document.styleSheets).map(sheet => {
            try {
                return {rules: sheet.cssRules, href: sheet.href};
            } catch (e) {
                console.warn(`Stylesheet could not be loaded: ${sheet.href}`, e);
                return {};
            }
        });
    };

    const inlineCss = (el, options) => {
        const {
            selectorRemap,
            modifyStyle,
            modifyCss,
            fonts,
            excludeUnusedCss
        } = options || {};
        const generateCss = modifyCss || ((selector, properties) => {
            const sel = selectorRemap ? selectorRemap(selector) : selector;
            const props = modifyStyle ? modifyStyle(properties) : properties;
            return `${sel}{${props}}\n`;
        });
        const css = [];
        const detectFonts = typeof fonts === 'undefined';
        const fontList = fonts || [];
        styleSheetRules().forEach(({rules, href}) => {
            if (!rules) return;
            Array.from(rules).forEach(rule => {
                if (typeof rule.style != 'undefined') {
                    if (query(el, rule.selectorText)) css.push(generateCss(rule.selectorText, rule.style.cssText));
                    else if (detectFonts && rule.cssText.match(/^@font-face/)) {
                        const font = detectCssFont(rule, href);
                        if (font) fontList.push(font);
                    } else if (!excludeUnusedCss) {
                        css.push(rule.cssText);
                    }
                }
            });
        });

        return inlineFonts(fontList).then(fontCss => css.join('\n') + fontCss);
    };

    const downloadOptions = () => {
        if (!navigator.msSaveOrOpenBlob && !('download' in document.createElement('a'))) {
            return {popup: window.open()};
        }
    };

    out$.prepareSvg = (el, options, done) => {
        requireDomNode(el);
        const {
            left = 0,
            top = 0,
            width: w,
            height: h,
            scale = 1,
            responsive = false,
            excludeCss = false,
        } = options || {};

        return inlineImages(el).then(() => {
            let clone = el.cloneNode(true);
            clone.style.backgroundColor = (options || {}).backgroundColor || el.style.backgroundColor;
            const {width, height} = getDimensions(el, clone, w, h);

            if (el.tagName !== 'svg') {
                if (el.getBBox) {
                    if (clone.getAttribute('transform') != null) {
                        clone.setAttribute('transform', clone.getAttribute('transform').replace(/translate\(.*?\)/, ''));
                    }
                    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
                    svg.appendChild(clone);
                    clone = svg;
                } else {
                    console.error('Attempted to render non-SVG element', el);
                    return;
                }
            }

            clone.setAttribute('version', '1.1');
            clone.setAttribute('viewBox', [left, top, width, height].join(' '));
            if (!clone.getAttribute('xmlns')) clone.setAttributeNS(xmlNs, 'xmlns', svgNs);
            if (!clone.getAttribute('xmlns:xlink')) clone.setAttributeNS(xmlNs, 'xmlns:xlink', 'http://www.w3.org/1999/xlink');

            if (responsive) {
                clone.removeAttribute('width');
                clone.removeAttribute('height');
                clone.setAttribute('preserveAspectRatio', 'xMinYMin meet');
            } else {
                clone.setAttribute('width', width * scale);
                clone.setAttribute('height', height * scale);
            }

            Array.from(clone.querySelectorAll('foreignObject > *')).forEach(foreignObject => {
                foreignObject.setAttributeNS(xmlNs, 'xmlns', foreignObject.tagName === 'svg' ? svgNs : xhtmlNs);
            });

            if (excludeCss) {
                const outer = document.createElement('div');
                outer.appendChild(clone);
                const src = outer.innerHTML;
                if (typeof done === 'function') done(src, width, height);
                else return {src, width, height};
            } else {
                return inlineCss(el, options).then(css => {
                    const style = document.createElement('style');
                    style.setAttribute('type', 'text/css');
                    style.innerHTML = `<![CDATA[\n${css}\n]]>`;

                    const defs = document.createElement('defs');
                    defs.appendChild(style);
                    clone.insertBefore(defs, clone.firstChild);

                    const outer = document.createElement('div');
                    outer.appendChild(clone);
                    const src = outer.innerHTML.replace(/NS\d+:href/gi, 'xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href');

                    if (typeof done === 'function') done(src, width, height);
                    else return {src, width, height};
                });
            }
        });
    };

    out$.svgAsDataUri = (el, options, done) => {
        requireDomNode(el);
        return out$.prepareSvg(el, options)
            .then(({src, width, height}) => {
                const svgXml = `data:image/svg+xml;base64,${window.btoa(reEncode(doctype+src))}`;
                if (typeof done === 'function') {
                    done(svgXml, width, height);
                }
                return svgXml;
            });
    };

    out$.svgAsPngUri = (el, options, done) => {
        requireDomNode(el);
        const {
            encoderType = 'image/png',
            encoderOptions = 0.8,
            canvg
        } = options || {};

        const convertToPng = ({src, width, height}) => {
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            const pixelRatio = window.devicePixelRatio || 1;

            canvas.width = width * pixelRatio;
            canvas.height = height * pixelRatio;
            canvas.style.width = `${canvas.width}px`;
            canvas.style.height = `${canvas.height}px`;
            context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

            if (canvg) {
                canvg(canvas, src);
            }
            else {
                context.drawImage(src, 0, 0);
            }

            let png = '';
            try {
                return new Promise((resolve) => {
                    canvas.toBlob(function (blob) {
                        png = URL.createObjectURL(blob);

                        if (typeof done === 'function') {
                            done(png, canvas.width, canvas.height);
                        }
                        resolve(png);

                    }, encoderType, encoderOptions);
                });
            } catch (e) {
                if ((typeof SecurityError !== 'undefined' && e instanceof SecurityError) || e.name === 'SecurityError') {
                    console.error('Rendered SVG images cannot be downloaded in this browser.');
                    return;
                } else throw e;
            }

        }

        if (canvg)
            return out$.prepareSvg(el, options).then(convertToPng);
        else
            return out$.svgAsDataUri(el, options).then(uri => {
                return new Promise((resolve, reject) => {
                    const image = new Image();
                    image.onload =  () => {
                        resolve(convertToPng({
                            src: image,
                            width: image.width,
                            height: image.height
                        }));
                    };
                    image.onerror = () => {
                        reject(`There was an error loading the data URI as an image on the following SVG\n${window.atob(uri.slice(26))}Open the following link to see browser's diagnosis\n${uri}`);
                    }
                    image.src = uri;
                })
            });
    };

    out$.download = (name, uri, options) => {
        try {
            if (!options) {
                options = {};
            }
            const downloadOpt = {
                autoClearObjectURL: true
            }
            const opts = Object.assign(options, downloadOpt);
            saveAs(uri, name, opts);
        } catch (e) {
            console.error(e);
            console.warn('Error while getting object URL. Falling back to string URL.');
        }
    };

    out$.saveSvg = (el, name, options) => {
        const downloadOpts = downloadOptions(); // don't inline, can't be async
        return requireDomNodePromise(el)
            .then(el => out$.svgAsDataUri(el, options || {}))
            .then(uri => out$.download(name, uri, downloadOpts || {}));
    };

    out$.saveSvgAsPng = (el, name, options) => {
        const downloadOpts = downloadOptions(); // don't inline, can't be async
        return requireDomNodePromise(el)
            .then(el => out$.svgAsPngUri(el, options || {}))
            .then(uri => out$.download(name, uri, downloadOpts || {}));
    };
})();
