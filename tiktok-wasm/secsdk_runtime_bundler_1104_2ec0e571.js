/*!
 * @byted/secsdk-strategy v1.0.30
 * (c) 2026
 */
! function(t) {
    "function" == typeof define && define.amd ? define(t) : t()
}((function() {
    "use strict";
    var t, e, n, r = window.fetch,
        o = [],
        i = !1,
        a = function(t, e, n) {
            ["projectId", "env", "name", "sdkVersion", "decisionName", "strategyName", "strategyVersion", "functionName", "actionType"].forEach((function(t) {
                void 0 === n[t] && (n[t] = "-")
            }));
            var a = parseInt(e);
            a && (o.push({
                name: t.name,
                tags: n,
                value: a,
                type: t.type
            }), i || (i = !0, setTimeout((function() {
                var t = JSON.stringify({
                    values: o
                });
                o = [];
                if (!window.use("coreLoader").customReportHost) {
                    try {
                        r("", {
                            method: "post",
                            body: t,
                            mode: "cors",
                            headers: {
                                "Content-Type": "application/json"
                            }
                        }).catch((function(t) {}))
                    } catch (t) {}
                    i = !1
                }
            }), 2e3)))
        };

    function c(t, e) {
        (null == e || e > t.length) && (e = t.length);
        for (var n = 0, r = Array(e); n < e; n++) r[n] = t[n];
        return r
    }

    function s(t, e, n, r, o, i, a) {
        try {
            var c = t[i](a),
                s = c.value
        } catch (t) {
            return void n(t)
        }
        c.done ? e(s) : Promise.resolve(s).then(r, o)
    }

    function u(t) {
        return function() {
            var e = this,
                n = arguments;
            return new Promise((function(r, o) {
                var i = t.apply(e, n);

                function a(t) {
                    s(i, r, o, a, c, "next", t)
                }

                function c(t) {
                    s(i, r, o, a, c, "throw", t)
                }
                a(void 0)
            }))
        }
    }

    function l(t, e) {
        if (!(t instanceof e)) throw new TypeError("Cannot call a class as a function")
    }

    function h(t, e) {
        for (var n = 0; n < e.length; n++) {
            var r = e[n];
            r.enumerable = r.enumerable || !1, r.configurable = !0, "value" in r && (r.writable = !0), Object.defineProperty(t, _(r.key), r)
        }
    }

    function f(t, e, n) {
        return e && h(t.prototype, e), n && h(t, n), Object.defineProperty(t, "prototype", {
            writable: !1
        }), t
    }

    function p(t, e) {
        var n = "undefined" != typeof Symbol && t[Symbol.iterator] || t["@@iterator"];
        if (!n) {
            if (Array.isArray(t) || (n = T(t)) || e && t && "number" == typeof t.length) {
                n && (t = n);
                var r = 0,
                    o = function() {};
                return {
                    s: o,
                    n: function() {
                        return r >= t.length ? {
                            done: !0
                        } : {
                            done: !1,
                            value: t[r++]
                        }
                    },
                    e: function(t) {
                        throw t
                    },
                    f: o
                }
            }
            throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.")
        }
        var i, a = !0,
            c = !1;
        return {
            s: function() {
                n = n.call(t)
            },
            n: function() {
                var t = n.next();
                return a = t.done, t
            },
            e: function(t) {
                c = !0, i = t
            },
            f: function() {
                try {
                    a || null == n.return || n.return()
                } finally {
                    if (c) throw i
                }
            }
        }
    }

    function d(t, e, n) {
        return (e = _(e)) in t ? Object.defineProperty(t, e, {
            value: n,
            enumerable: !0,
            configurable: !0,
            writable: !0
        }) : t[e] = n, t
    }

    function v() {
        return v = Object.assign ? Object.assign.bind() : function(t) {
            for (var e = 1; e < arguments.length; e++) {
                var n = arguments[e];
                for (var r in n)({}).hasOwnProperty.call(n, r) && (t[r] = n[r])
            }
            return t
        }, v.apply(null, arguments)
    }

    function y(t, e) {
        var n = Object.keys(t);
        if (Object.getOwnPropertySymbols) {
            var r = Object.getOwnPropertySymbols(t);
            e && (r = r.filter((function(e) {
                return Object.getOwnPropertyDescriptor(t, e).enumerable
            }))), n.push.apply(n, r)
        }
        return n
    }

    function E(t) {
        for (var e = 1; e < arguments.length; e++) {
            var n = null != arguments[e] ? arguments[e] : {};
            e % 2 ? y(Object(n), !0).forEach((function(e) {
                d(t, e, n[e])
            })) : Object.getOwnPropertyDescriptors ? Object.defineProperties(t, Object.getOwnPropertyDescriptors(n)) : y(Object(n)).forEach((function(e) {
                Object.defineProperty(t, e, Object.getOwnPropertyDescriptor(n, e))
            }))
        }
        return t
    }

    function g(t, e) {
        if (null == t) return {};
        var n, r, o = function(t, e) {
            if (null == t) return {};
            var n = {};
            for (var r in t)
                if ({}.hasOwnProperty.call(t, r)) {
                    if (e.includes(r)) continue;
                    n[r] = t[r]
                } return n
        }(t, e);
        if (Object.getOwnPropertySymbols) {
            var i = Object.getOwnPropertySymbols(t);
            for (r = 0; r < i.length; r++) n = i[r], e.includes(n) || {}.propertyIsEnumerable.call(t, n) && (o[n] = t[n])
        }
        return o
    }

    function S() {
        S = function() {
            return e
        };
        var t, e = {},
            n = Object.prototype,
            r = n.hasOwnProperty,
            o = Object.defineProperty || function(t, e, n) {
                t[e] = n.value
            },
            i = "function" == typeof Symbol ? Symbol : {},
            a = i.iterator || "@@iterator",
            c = i.asyncIterator || "@@asyncIterator",
            s = i.toStringTag || "@@toStringTag";

        function u(t, e, n) {
            return Object.defineProperty(t, e, {
                value: n,
                enumerable: !0,
                configurable: !0,
                writable: !0
            }), t[e]
        }
        try {
            u({}, "")
        } catch (t) {
            u = function(t, e, n) {
                return t[e] = n
            }
        }

        function l(t, e, n, r) {
            var i = e && e.prototype instanceof E ? e : E,
                a = Object.create(i.prototype),
                c = new D(r || []);
            return o(a, "_invoke", {
                value: N(t, n, c)
            }), a
        }

        function h(t, e, n) {
            try {
                return {
                    type: "normal",
                    arg: t.call(e, n)
                }
            } catch (t) {
                return {
                    type: "throw",
                    arg: t
                }
            }
        }
        e.wrap = l;
        var f = "suspendedStart",
            p = "suspendedYield",
            d = "executing",
            v = "completed",
            y = {};

        function E() {}

        function g() {}

        function m() {}
        var _ = {};
        u(_, a, (function() {
            return this
        }));
        var O = Object.getPrototypeOf,
            T = O && O(O(L([])));
        T && T !== n && r.call(T, a) && (_ = T);
        var R = m.prototype = E.prototype = Object.create(_);

        function A(t) {
            ["next", "throw", "return"].forEach((function(e) {
                u(t, e, (function(t) {
                    return this._invoke(e, t)
                }))
            }))
        }

        function I(t, e) {
            function n(o, i, a, c) {
                var s = h(t[o], t, i);
                if ("throw" !== s.type) {
                    var u = s.arg,
                        l = u.value;
                    return l && "object" == typeof l && r.call(l, "__await") ? e.resolve(l.__await).then((function(t) {
                        n("next", t, a, c)
                    }), (function(t) {
                        n("throw", t, a, c)
                    })) : e.resolve(l).then((function(t) {
                        u.value = t, a(u)
                    }), (function(t) {
                        return n("throw", t, a, c)
                    }))
                }
                c(s.arg)
            }
            var i;
            o(this, "_invoke", {
                value: function(t, r) {
                    function o() {
                        return new e((function(e, o) {
                            n(t, r, e, o)
                        }))
                    }
                    return i = i ? i.then(o, o) : o()
                }
            })
        }

        function N(e, n, r) {
            var o = f;
            return function(i, a) {
                if (o === d) throw Error("Generator is already running");
                if (o === v) {
                    if ("throw" === i) throw a;
                    return {
                        value: t,
                        done: !0
                    }
                }
                for (r.method = i, r.arg = a;;) {
                    var c = r.delegate;
                    if (c) {
                        var s = w(c, r);
                        if (s) {
                            if (s === y) continue;
                            return s
                        }
                    }
                    if ("next" === r.method) r.sent = r._sent = r.arg;
                    else if ("throw" === r.method) {
                        if (o === f) throw o = v, r.arg;
                        r.dispatchException(r.arg)
                    } else "return" === r.method && r.abrupt("return", r.arg);
                    o = d;
                    var u = h(e, n, r);
                    if ("normal" === u.type) {
                        if (o = r.done ? v : p, u.arg === y) continue;
                        return {
                            value: u.arg,
                            done: r.done
                        }
                    }
                    "throw" === u.type && (o = v, r.method = "throw", r.arg = u.arg)
                }
            }
        }

        function w(e, n) {
            var r = n.method,
                o = e.iterator[r];
            if (o === t) return n.delegate = null, "throw" === r && e.iterator.return && (n.method = "return", n.arg = t, w(e, n), "throw" === n.method) || "return" !== r && (n.method = "throw", n.arg = new TypeError("The iterator does not provide a '" + r + "' method")), y;
            var i = h(o, e.iterator, n.arg);
            if ("throw" === i.type) return n.method = "throw", n.arg = i.arg, n.delegate = null, y;
            var a = i.arg;
            return a ? a.done ? (n[e.resultName] = a.value, n.next = e.nextLoc, "return" !== n.method && (n.method = "next", n.arg = t), n.delegate = null, y) : a : (n.method = "throw", n.arg = new TypeError("iterator result is not an object"), n.delegate = null, y)
        }

        function b(t) {
            var e = {
                tryLoc: t[0]
            };
            1 in t && (e.catchLoc = t[1]), 2 in t && (e.finallyLoc = t[2], e.afterLoc = t[3]), this.tryEntries.push(e)
        }

        function C(t) {
            var e = t.completion || {};
            e.type = "normal", delete e.arg, t.completion = e
        }

        function D(t) {
            this.tryEntries = [{
                tryLoc: "root"
            }], t.forEach(b, this), this.reset(!0)
        }

        function L(e) {
            if (e || "" === e) {
                var n = e[a];
                if (n) return n.call(e);
                if ("function" == typeof e.next) return e;
                if (!isNaN(e.length)) {
                    var o = -1,
                        i = function n() {
                            for (; ++o < e.length;)
                                if (r.call(e, o)) return n.value = e[o], n.done = !1, n;
                            return n.value = t, n.done = !0, n
                        };
                    return i.next = i
                }
            }
            throw new TypeError(typeof e + " is not iterable")
        }
        return g.prototype = m, o(R, "constructor", {
            value: m,
            configurable: !0
        }), o(m, "constructor", {
            value: g,
            configurable: !0
        }), g.displayName = u(m, s, "GeneratorFunction"), e.isGeneratorFunction = function(t) {
            var e = "function" == typeof t && t.constructor;
            return !!e && (e === g || "GeneratorFunction" === (e.displayName || e.name))
        }, e.mark = function(t) {
            return Object.setPrototypeOf ? Object.setPrototypeOf(t, m) : (t.__proto__ = m, u(t, s, "GeneratorFunction")), t.prototype = Object.create(R), t
        }, e.awrap = function(t) {
            return {
                __await: t
            }
        }, A(I.prototype), u(I.prototype, c, (function() {
            return this
        })), e.AsyncIterator = I, e.async = function(t, n, r, o, i) {
            void 0 === i && (i = Promise);
            var a = new I(l(t, n, r, o), i);
            return e.isGeneratorFunction(n) ? a : a.next().then((function(t) {
                return t.done ? t.value : a.next()
            }))
        }, A(R), u(R, s, "Generator"), u(R, a, (function() {
            return this
        })), u(R, "toString", (function() {
            return "[object Generator]"
        })), e.keys = function(t) {
            var e = Object(t),
                n = [];
            for (var r in e) n.push(r);
            return n.reverse(),
                function t() {
                    for (; n.length;) {
                        var r = n.pop();
                        if (r in e) return t.value = r, t.done = !1, t
                    }
                    return t.done = !0, t
                }
        }, e.values = L, D.prototype = {
            constructor: D,
            reset: function(e) {
                if (this.prev = 0, this.next = 0, this.sent = this._sent = t, this.done = !1, this.delegate = null, this.method = "next", this.arg = t, this.tryEntries.forEach(C), !e)
                    for (var n in this) "t" === n.charAt(0) && r.call(this, n) && !isNaN(+n.slice(1)) && (this[n] = t)
            },
            stop: function() {
                this.done = !0;
                var t = this.tryEntries[0].completion;
                if ("throw" === t.type) throw t.arg;
                return this.rval
            },
            dispatchException: function(e) {
                if (this.done) throw e;
                var n = this;

                function o(r, o) {
                    return c.type = "throw", c.arg = e, n.next = r, o && (n.method = "next", n.arg = t), !!o
                }
                for (var i = this.tryEntries.length - 1; i >= 0; --i) {
                    var a = this.tryEntries[i],
                        c = a.completion;
                    if ("root" === a.tryLoc) return o("end");
                    if (a.tryLoc <= this.prev) {
                        var s = r.call(a, "catchLoc"),
                            u = r.call(a, "finallyLoc");
                        if (s && u) {
                            if (this.prev < a.catchLoc) return o(a.catchLoc, !0);
                            if (this.prev < a.finallyLoc) return o(a.finallyLoc)
                        } else if (s) {
                            if (this.prev < a.catchLoc) return o(a.catchLoc, !0)
                        } else {
                            if (!u) throw Error("try statement without catch or finally");
                            if (this.prev < a.finallyLoc) return o(a.finallyLoc)
                        }
                    }
                }
            },
            abrupt: function(t, e) {
                for (var n = this.tryEntries.length - 1; n >= 0; --n) {
                    var o = this.tryEntries[n];
                    if (o.tryLoc <= this.prev && r.call(o, "finallyLoc") && this.prev < o.finallyLoc) {
                        var i = o;
                        break
                    }
                }
                i && ("break" === t || "continue" === t) && i.tryLoc <= e && e <= i.finallyLoc && (i = null);
                var a = i ? i.completion : {};
                return a.type = t, a.arg = e, i ? (this.method = "next", this.next = i.finallyLoc, y) : this.complete(a)
            },
            complete: function(t, e) {
                if ("throw" === t.type) throw t.arg;
                return "break" === t.type || "continue" === t.type ? this.next = t.arg : "return" === t.type ? (this.rval = this.arg = t.arg, this.method = "return", this.next = "end") : "normal" === t.type && e && (this.next = e), y
            },
            finish: function(t) {
                for (var e = this.tryEntries.length - 1; e >= 0; --e) {
                    var n = this.tryEntries[e];
                    if (n.finallyLoc === t) return this.complete(n.completion, n.afterLoc), C(n), y
                }
            },
            catch: function(t) {
                for (var e = this.tryEntries.length - 1; e >= 0; --e) {
                    var n = this.tryEntries[e];
                    if (n.tryLoc === t) {
                        var r = n.completion;
                        if ("throw" === r.type) {
                            var o = r.arg;
                            C(n)
                        }
                        return o
                    }
                }
                throw Error("illegal catch attempt")
            },
            delegateYield: function(e, n, r) {
                return this.delegate = {
                    iterator: L(e),
                    resultName: n,
                    nextLoc: r
                }, "next" === this.method && (this.arg = t), y
            }
        }, e
    }

    function m(t) {
        return function(t) {
            if (Array.isArray(t)) return c(t)
        }(t) || function(t) {
            if ("undefined" != typeof Symbol && null != t[Symbol.iterator] || null != t["@@iterator"]) return Array.from(t)
        }(t) || T(t) || function() {
            throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.")
        }()
    }

    function _(t) {
        var e = function(t, e) {
            if ("object" != typeof t || !t) return t;
            var n = t[Symbol.toPrimitive];
            if (void 0 !== n) {
                var r = n.call(t, e || "default");
                if ("object" != typeof r) return r;
                throw new TypeError("@@toPrimitive must return a primitive value.")
            }
            return ("string" === e ? String : Number)(t)
        }(t, "string");
        return "symbol" == typeof e ? e : e + ""
    }

    function O(t) {
        return O = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(t) {
            return typeof t
        } : function(t) {
            return t && "function" == typeof Symbol && t.constructor === Symbol && t !== Symbol.prototype ? "symbol" : typeof t
        }, O(t)
    }

    function T(t, e) {
        if (t) {
            if ("string" == typeof t) return c(t, e);
            var n = {}.toString.call(t).slice(8, -1);
            return "Object" === n && t.constructor && (n = t.constructor.name), "Map" === n || "Set" === n ? Array.from(t) : "Arguments" === n || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n) ? c(t, e) : void 0
        }
    }! function(t) {
        t.API_LOCALSTORAGE_SET = "API_LOCALSTORAGE_SET", t.API_LOCALSTORAGE_GET = "API_LOCALSTORAGE_GET", t.API_SESSIONSTORAGE_SET = "API_SESSIONSTORAGE_SET", t.API_SESSIONSTORAGE_GET = "API_SESSIONSTORAGE_GET", t.GEOLOCATION_CURRENT_POSITION = "GEOLOCATION_CURRENT_POSITION", t.GEOLOCATION_WATCH_POSITION = "GEOLOCATION_WATCH_POSITION", t.CLIPBOARD_WRITE_TEXT = "CLIPBOARD_WRITE_TEXT", t.MEDIADEVICES_GETUSERMEDIA = "MEDIADEVICES_GETUSERMEDIA", t.INDEXDB_ADD = "INDEXDB_ADD", t.POST_MESSAGE = "POST_MESSAGE", t.OPEN = "OPEN", t.MESSAGE = "MESSAGE", t.INDEXDB_PUT = "INDEXDB_PUT", t.INDEXDB_UPDATE = "INDEXDB_UPDATE", t.LOCATION_REPLACE = "LOCATION_REPLACE", t.LOCATION_ASSIGN = "LOCATION_ASSIGN", t.WINDOW_OPEN = "WINDOW_OPEN", t.COOKIE_GET = "COOKIE_GET", t.COOKIE_SET = "COOKIE_SET", t.CLICK = "CLICK", t.COPY = "COPY", t.IMG_SRC_SET = "IMG_SRC_SET", t.IMG_SRC_GET = "IMG_SRC_GET", t.WINDOW_LOCATION_SET = "WINDOW_LOCATION_SET", t.WINDOW_LOCATION_HREF_SET = "WINDOW_LOCATION_HREF_SET", t.NAVIGATOR_SEND_BEACON = "NAVIGATOR_SEND_BEACON", t.REQUEST_FILE_STSTEM = "REQUEST_FILE_STSTEM", t.CLIPBOARD_READ_TEXT = "CLIPBOARD_READ_TEXT", t.EXCU_COMMAND = "EXCUTE_COMMAND", t.XHR_REQUEST_OPEN = "XHR_REQUEST_OPEN", t.XHR_REQUEST_SEND = "XHR_REQUEST_SEND", t.XHR_REQUEST_SETQEQUESTHEADER = "XHR_REQUEST_SETQEQUESTHEADER", t.XHR_RESPONSE_LOADEND = "XHR_RESPONSE_LOADEND", t.XHR_RESPONSE_READYSTATECHANGE = "XHR_RESPONSE_READYSTATECHANGE", t.FETCH_REQUEST = "FETCH_REQUEST", t.FETCH_RESPONSE = "FETCH_RESPONSE", t.FETCH_ADDHEADER = "FETCH_ADDHEADER", t.DOM_CONTENT_LOADED = "DOM_CONTENT_LOADED", t.MUTATION_OBSERVER = "MUTATION_OBSERVER", t.PERFORMANCE_OBSERVER = "PERFORMANCE_OBSERVER", t.SDK_REPORT_INIT = "SDK_REPORT_INIT", t.SDK_INIT = "SDK_INIT", t.CONTENT_LOADED = "CONTENT_LOADED", t.XHR_RESPONSE_ERROR = "XHR_RESPONSE_ERROR"
    }(t || (t = {})),
    function(t) {
        t.LOCALSTORAGE_SET = "localstorage.setItem", t.REPORT_CONFIG_SET = "report_config.set"
    }(e || (e = {})),
    function(t) {
        t.PASS = "PASS", t.REPORT_ONLY = "REPORT_ONLY", t.REWRITE = "REWRITE", t.BLOCK = "BLOCK", t.ERROR = "ERROR"
    }(n || (n = {}));
    var R = {
            errorNum: {
                name: "resource.error_num",
                type: "delta_counter"
            },
            latency: {
                name: "resource.latency",
                type: "time"
            }
        },
        A = {
            errorNum: {
                name: "decision.error_num",
                type: "delta_counter"
            },
            latency: {
                name: "decision.latency",
                type: "time"
            }
        },
        I = {
            errorNum: {
                name: "strategy.error_num",
                type: "delta_counter"
            },
            latency: {
                name: "strategy.latency",
                type: "time"
            }
        },
        N = {
            errorNum: {
                name: "function.error_num",
                type: "delta_counter"
            },
            latency: {
                name: "function.latency",
                type: "time"
            }
        },
        w = ["click", "mouseenter", "mouseleave", "mousedown", "mouseup", "focus", "blur"],
        b = ["change"],
        C = function() {
            return f((function t() {
                l(this, t), this.secEventMap = {}, this.secEventMap = {}
            }), [{
                key: "addToEventMap",
                value: function(t, e) {
                    var n = arguments.length > 2 && void 0 !== arguments[2] && arguments[2],
                        r = this.secEventMap[t] || [];
                    r.push({
                        fn: e,
                        once: n
                    }), this.secEventMap[t] = r
                }
            }, {
                key: "on",
                value: function(t, e) {
                    var n = this,
                        r = arguments.length > 2 && void 0 !== arguments[2] && arguments[2];
                    return this.addToEventMap(t, e, r),
                        function() {
                            n.secEventMap[t] = n.secEventMap[t].filter((function(t) {
                                return e !== t.fn
                            }))
                        }
                }
            }, {
                key: "emit",
                value: function(t, e) {
                    var n = t.name,
                        r = this.secEventMap[n] || [];
                    if (r.length) {
                        var o = this,
                            i = [];
                        r.forEach((function(n) {
                            !n.once && i.push(n), n.fn.call(o, {
                                event: t,
                                action: e
                            })
                        })), this.secEventMap[n] = i
                    }
                }
            }, {
                key: "off",
                value: function(t, e) {
                    if (e) {
                        var n = this.secEventMap[t] || [];
                        this.secEventMap[t] = n.filter((function(t) {
                            return t.fn !== e
                        }))
                    } else this.secEventMap[t] = []
                }
            }, {
                key: "once",
                value: function(t, e) {
                    this.addToEventMap(t, e, !0)
                }
            }])
        }(),
        D = new C,
        L = ["module", "global", "require"],
        P = Object.keys(window).filter((function(t) {
            return !L.includes(t)
        })),
        j = {
            module: {},
            global: {
                ActionType: n,
                EventEmitter: D
            },
            require: function(t) {
                return j.module[t] || j.global[t]
            }
        };
    P.forEach((function(t) {
        Object.defineProperty(j, t, {
            get: function() {
                console.warn("绂佹鐩存帴璁块棶瀹夸富鐜")
            }
        })
    })), window.SDKRuntime = j;
    var M = function(t, e) {
        j.global[t] = e
    };
    window.registToGlobal = M;
    window.registToModule = function(t, e) {
        if (j.module[t] = e, "strategy" === t) {
            var n = j.require("coreLoader");
            if (!n) return;
            n.initReportStrategy()
        }
    };
    var k = function(t) {
        return j.require(t)
    };
    window.use = k, window.useWebSecsdkApi = k;
    var G = function(t) {
            try {
                return new Function("".concat(t, ";"))()
            } catch (t) {}
        },
        x = function(t, e, n) {
            window.SDKNativeWebApi ? window.SDKNativeWebApi[t] = {
                context: e,
                fn: n
            } : window.SDKNativeWebApi = d({}, t, {
                context: e,
                fn: n
            });
            try {
                e.SDKNativeWebApi ? e.SDKNativeWebApi[t] = {
                    context: e,
                    fn: n
                } : e.SDKNativeWebApi = {}
            } catch (t) {
                console.warn("storageWebNativeApi 鍑芥暟缂撳瓨澶辫触")
            }
        },
        H = function(t) {
            var e;
            if (t) return null === (e = window.SDKNativeWebApi) || void 0 === e ? void 0 : e[t]
        },
        U = function(e) {
            var n = localStorage.getItem.bind(localStorage),
                r = H(t.API_LOCALSTORAGE_GET);
            return r && (n = r.fn.bind(localStorage)), n(e)
        },
        X = function(e, n) {
            var r = localStorage.setItem.bind(localStorage),
                o = H(t.API_LOCALSTORAGE_SET);
            o && (r = o.fn.bind(localStorage)), r(e, n)
        },
        B = "web_secsdk_runtime_cache";

    function F() {
        var t = function() {
            for (var t = new Array(16), e = 0, n = 0; n < 16; n++) 3 & n || (e = 4294967296 * Math.random()), t[n] = e >>> ((3 & n) << 3) & 255;
            return t
        }();
        return t[6] = 15 & t[6] | 64, t[8] = 63 & t[8] | 128,
            function(t) {
                for (var e = [], n = 0; n < 256; ++n) e[n] = (n + 256).toString(16).substr(1);
                var r = 0,
                    o = e;
                return [o[t[r++]], o[t[r++]], o[t[r++]], o[t[r++]], "-", o[t[r++]], o[t[r++]], "-", o[t[r++]], o[t[r++]], "-", o[t[r++]], o[t[r++]], "-", o[t[r++]], o[t[r++]], o[t[r++]], o[t[r++]], o[t[r++]], o[t[r++]]].join("")
            }(t)
    }
    var Q = localStorage.getItem.bind(localStorage),
        q = "web_runtime_security_uid",
        W = H(t.API_LOCALSTORAGE_GET);
    W && (Q = W.fn.bind(localStorage));
    var K = Q(q);
    if (!K || "undefined" === K) {
        K = F(), document.cookie.includes("x-web-secsdk-uid") || (document.cookie = "x-web-secsdk-uid=".concat(K, "; path=/;"));
        var V = localStorage.setItem.bind(localStorage),
            Y = H(t.API_LOCALSTORAGE_SET);
        Y && (V = Y.fn.bind(localStorage)), V(q, K)
    }
    var J, z = new(function() {
        return f((function t() {
            l(this, t), this.uid = void 0
        }), [{
            key: "loadUid",
            value: function() {
                this.uid || (this.uid = K)
            }
        }, {
            key: "setUid",
            value: function(t) {
                localStorage.removeItem(q), this.uid = t
            }
        }, {
            key: "getUid",
            value: function() {
                return this.uid
            }
        }])
    }());
    d({}, t.API_LOCALSTORAGE_SET, ["text"]);
    var $ = (d(d(d(d(d(d(d(d(d(d(J = {}, t.API_LOCALSTORAGE_SET, "localStorage.setItem"), t.API_LOCALSTORAGE_GET, "localStorage.getItem"), t.API_SESSIONSTORAGE_SET, "sessionStorage.setItem"), t.API_SESSIONSTORAGE_GET, "sessionStorage.getItem"), t.GEOLOCATION_CURRENT_POSITION, "Geolocation.prototype.getCurrentPosition"), t.GEOLOCATION_WATCH_POSITION, "Geolocation.prototype.watchPosition"), t.CLIPBOARD_WRITE_TEXT, "Clipboard.prototype.writeText"), t.MEDIADEVICES_GETUSERMEDIA, "MediaDevices.prototype.getUserMedia"), t.INDEXDB_ADD, "IDBObjectStore.prototype.add"), t.INDEXDB_PUT, "IDBObjectStore.prototype.put"), d(d(d(d(d(d(d(d(d(d(J, t.INDEXDB_UPDATE, "IDBCursor.prototype.update"), t.NAVIGATOR_SEND_BEACON, "Navigator.prototype.sendBeacon"), t.REQUEST_FILE_STSTEM, "requestFileSystem"), t.CLIPBOARD_READ_TEXT, "navigator.clipboard.readText"), t.XHR_REQUEST_OPEN, "XMLHttpRequest.prototype.open"), t.XHR_REQUEST_SEND, "XMLHttpRequest.prototype.send"), t.XHR_RESPONSE_LOADEND, "xhr.onloadend"), t.XHR_RESPONSE_READYSTATECHANGE, "xhr.onreadystatechange"), t.XHR_RESPONSE_ERROR, "xhr.onerror"), t.FETCH_REQUEST, "window.Request"), d(d(d(d(d(d(d(d(d(d(J, t.FETCH_RESPONSE, "window.Response"), t.COOKIE_GET, "document.cookie"), t.COOKIE_SET, "document.cookie"), t.CLICK, "click event"), t.COPY, "copy event"), t.IMG_SRC_SET, "HTMLImageElement.prototype.src"), t.IMG_SRC_GET, "HTMLImageElement.prototype.src"), t.EXCU_COMMAND, "document.execCommand"), t.DOM_CONTENT_LOADED, "DOMContentLoaded"), t.MUTATION_OBSERVER, "MutationObserver"), d(d(d(J, t.PERFORMANCE_OBSERVER, "PerformanceObserver"), t.XHR_REQUEST_SETQEQUESTHEADER, "XMLHttpRequest.prototype.setRequestHeader"), t.FETCH_ADDHEADER, "addHeader"));
    d(d(d(d(d(d(d(d(d({}, t.API_LOCALSTORAGE_SET, "ApiStorageSet"), t.API_LOCALSTORAGE_GET, "ApiStorageGet"), t.API_SESSIONSTORAGE_SET, "ApiStorageSet"), t.API_SESSIONSTORAGE_GET, "ApiStorageGet"), t.COPY, "Copy"), t.XHR_REQUEST_OPEN, "XHRRequestOpen"), t.XHR_REQUEST_SEND, "XHRRequestSend"), t.FETCH_REQUEST, "FetchRequest"), t.FETCH_RESPONSE, "FetchResponse");
    var Z = new(function() {
            return f((function t(e, n) {
                l(this, t), this.pid = void 0, this.uid = void 0, this.strategy = {}, this.pid = e, this.uid = n
            }), [{
                key: "loadStrategyProps",
                value: function(t) {
                    var e = window.use("strategy");
                    return Object.keys((null == e ? void 0 : e.strategy) || {}).reduce((function(n, r) {
                        return n[r] = e.strategy[r][t], n
                    }), {})
                }
            }, {
                key: "loadStrategyExtensionTools",
                value: function() {
                    return this.loadStrategyProps("extensionTools")
                }
            }, {
                key: "loadStrategyConfig",
                value: function(t) {
                    return this.loadStrategyProps("config")[t]
                }
            }, {
                key: "loadStrategyMap",
                value: function() {
                    return this.loadStrategyProps("body")
                }
            }, {
                key: "loadStrategyGroup",
                value: function() {
                    var t = window.use("strategy");
                    return (null == t ? void 0 : t.event) || {}
                }
            }])
        }())("64", "1111"),
        tt = window.fetch,
        et = window.navigator,
        nt = et.sendBeacon,
        rt = nt && "function" == typeof nt,
        ot = 1e4,
        it = {
            bid: "argus3",
            region: "cn",
            timeInterval: 2,
            maxSize: 100,
            sampleRatio: {
                ratio: 100
            }
        },
        at = function() {
            return f((function t() {
                l(this, t), this.prefix = void 0, this.curIndex = void 0, this.map = void 0, this.valueMap = void 0, this.hashCode = void 0, this.hashCodeMap = void 0, this.resultData = void 0, this.hashMap = void 0, this.prefix = "", this.curIndex = -1, this.map = {}, this.valueMap = {};
                for (var e = [], n = 0; n < 10; n++) e.push(n + "");
                for (var r = 0; r < 26; r++) e.push(String.fromCharCode(65 + r));
                for (var o = 0; o < 26; o++) e.push(String.fromCharCode(97 + o));
                this.hashCode = e, this.hashCodeMap = {};
                for (var i = 0; i < this.hashCode.length; i++) this.hashCodeMap[this.hashCode[i]] = i
            }), [{
                key: "incrementPrefix",
                value: function() {
                    if (0 !== this.prefix.length) {
                        for (var t = this.prefix.split(""), e = t.length - 1, n = !0; e >= 0; e--) {
                            if (t[e] !== this.hashCode[this.hashCode.length - 1]) {
                                t[e] = this.hashCode[this.hashCodeMap[t[e]] + 1], n = !1;
                                break
                            }
                            t[e] = this.hashCode[0]
                        }
                        n && (t[e] !== this.hashCode[this.hashCode.length - 1] ? t[e] = this.hashCode[this.hashCodeMap[t[e]] + 1] : (t[e] = this.hashCode[0], t.unshift(this.hashCode[0]))), this.prefix = t.join("")
                    } else this.prefix = this.hashCode[0]
                }
            }, {
                key: "increment",
                value: function() {
                    this.curIndex === this.hashCode.length - 1 ? (this.curIndex = 0, this.incrementPrefix()) : this.curIndex++;
                    var t = this.hashCode[this.curIndex];
                    return this.prefix + t
                }
            }, {
                key: "get",
                value: function(t) {
                    return this.map[t] ? this.map[t] : this.set(t)
                }
            }, {
                key: "getKey",
                value: function(t) {
                    return this.valueMap[t]
                }
            }, {
                key: "set",
                value: function(t) {
                    var e = this.increment();
                    return this.map[t] = e, this.valueMap[e] = t, e
                }
            }])
        }(),
        ct = function() {
            return f((function t() {
                l(this, t), this.hashMap = void 0, this.resultData = void 0, this.init()
            }), [{
                key: "init",
                value: function() {
                    this.hashMap = new at, this.resultData = []
                }
            }, {
                key: "convertNodeSchema",
                value: function(t) {
                    var e = this,
                        n = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : 3;
                    if (!t || ["html", "body"].includes(t.name) || 0 === n) return null;
                    var r = [];
                    return Object.keys(t).forEach((function(o) {
                        if ("type" !== o)
                            if ("children" === o) {
                                var i = [];
                                t[o].map((function(t) {
                                    var r = e.convertNodeSchema(t, n - 1);
                                    r && i.push(r)
                                })), r.push("[".concat(i.join(","), "]"))
                            } else if ("attrs" === o) {
                            var a = [];
                            Object.keys(t[o]).forEach((function(n) {
                                a.push(e.hashMap.get(n)), a.push(e.hashMap.get(t[o][n]))
                            })), r.push("[".concat(a.join(","), "]"))
                        } else "type" === o || "name" === o ? r.push(e.hashMap.get(t[o])) : r.push(t[o])
                    })), "[".concat(r.join(","), "]")
                }
            }, {
                key: "convertNodeListSchema",
                value: function(t) {
                    var e = this,
                        n = [];
                    t.map((function(t) {
                        var r = e.convertNodeSchema(t);
                        r && n.push(r)
                    })), this.resultData.push("[".concat(n.join(","), "]"))
                }
            }, {
                key: "convertEventSchema",
                value: function(t) {
                    var e = this,
                        n = [];
                    return Object.keys(t).forEach((function(r) {
                        if ("target" === r) {
                            var o = e.convertNodeSchema(t[r]);
                            n.push(o)
                        } else if ("axis" === r) {
                            var i = [];
                            Object.keys(t[r]).forEach((function(e) {
                                i.push(t[r][e])
                            })), n.push("[".concat(i.join(","), "]"))
                        } else n.push(e.hashMap.get(t[r]))
                    })), "[".concat(n.join(","), "]")
                }
            }, {
                key: "convertEventListSchema",
                value: function(t) {
                    var e = this,
                        n = [];
                    t.map((function(t) {
                        var r = e.convertEventSchema(t);
                        r && n.push(r)
                    })), this.resultData.push("[".concat(n.join(","), "]"))
                }
            }, {
                key: "convertRequestSchema",
                value: function(t) {
                    var e = this,
                        n = [];
                    return Object.keys(t).forEach((function(r) {
                        if ("query" === r) {
                            var o = [];
                            Object.keys(t[r]).forEach((function(t) {
                                o.push(e.hashMap.get(t))
                            })), n.push("[".concat(o.join(","), "]"))
                        } else if ("header" === r) {
                            var i = [];
                            Object.keys(t[r]).forEach((function(n) {
                                i.push(e.hashMap.get(n)), i.push(t[r][n])
                            })), n.push("[".concat(i.join(","), "]"))
                        } else n.push(e.hashMap.get(t[r]))
                    })), "[".concat(n.join(","), "]")
                }
            }, {
                key: "convertRequestListSchema",
                value: function(t) {
                    var e = this,
                        n = [];
                    t.map((function(t) {
                        var r = e.convertRequestSchema(t);
                        r && n.push(r)
                    })), this.resultData.push("[".concat(n.join(","), "]"))
                }
            }, {
                key: "getResult",
                value: function() {
                    var t = this.resultData.join(","),
                        e = "[".concat(Object.values(this.hashMap.valueMap).map((function(t) {
                            return "'".concat(t, "'")
                        })).join(","), "]");
                    return this.init(), {
                        hashMap: e,
                        version: "1",
                        payload: t
                    }
                }
            }])
        }(),
        st = ["context", "__secReqHeaders"],
        ut = ["eventOverwrite"],
        lt = function() {
            return f((function t(e) {
                var n = this;
                l(this, t), this.sampleDataQueue = [], this.config = it, this.isReporting = !1, this.configInited = !1, this.getSlardarBid = function() {
                    return n.config.bid || "argus3"
                }, this.getConfigRegion = function() {
                    var t = k("coreLoader");
                    return t ? t.customReportHost ? "custom" : t.host.includes("sf") ? "sg" : "cn" : (n.config.region || "cn").toLowerCase()
                }, this.gerReportUrl = function() {
                    if ("custom" === n.getConfigRegion()) {
                        var t = k("coreLoader");
                        return "https://".concat(t.customReportHost, "/monitor_browser/collect/batch/security/?bid=") + n.getSlardarBid()
                    }
                    var e = {} [n.getConfigRegion()];
                    if (e) return e + n.getSlardarBid()
                }, this.setConfig(e)
            }), [{
                key: "report",
                value: function(t) {
                    var e, n = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : "runtime_strategy";
                    z.loadUid();
                    var r = window.use("reportOptions");
                    this.configInited || (this.setConfig(r), this.configInited = !0);
                    var o = t.event,
                        i = t.action,
                        a = t.fromStage,
                        c = this.shouleAddToSampleQueue(t),
                        s = (null == i ? void 0 : i.key) || o.pageUrl || window.location.href,
                        u = s + a;
                    if (null != i && i.once) {
                        var l = function(t) {
                            var e = U(B) || "{}";
                            try {
                                return JSON.parse(e)[t]
                            } catch (t) {
                                return void console.warn("web_secsdk_runtime_cache set json parse error")
                            }
                        }(i.strategyKey) || [];
                        if (l.includes(u)) return;
                        c = !0, l.push(u),
                            function(t, e) {
                                var n = U(B) || "{}";
                                try {
                                    var r = JSON.parse(n);
                                    r[t] = e, X(B, JSON.stringify(r))
                                } catch (t) {
                                    return void console.warn("web_secsdk_runtime_cache get json parse error")
                                }
                            }(i.strategyKey, l)
                    }
                    var h = v({}, (function(t) {
                            if (null == t) throw new TypeError("Cannot destructure " + t)
                        }(o), o)),
                        f = h.payload;
                    f.context, f.__secReqHeaders;
                    var p = g(f, st);
                    h.payload = p, i.eventOverwrite;
                    var d = g(i, ut),
                        y = Object.assign(this.constructNewDataWithPrifix(h, "event"), this.constructNewDataWithPrifix(d, "action"), i.eventOverwrite ? this.constructNewDataWithPrifix({
                            payload: null == i ? void 0 : i.eventOverwrite
                        }, "event") : {}, {
                            fromStage: a,
                            documentURL: window.location.href,
                            uId: z.getUid(),
                            sdkVersion: "1.0.30"
                        }),
                        E = Object.keys(y).reduce((function(t, e, n) {
                            return "string" == typeof y[e] && (t[e] = y[e]), t
                        }), {}),
                        S = Object.keys(y).reduce((function(t, e, n) {
                            return "number" == typeof y[e] && (t[e] = y[e]), t
                        }), {}),
                        m = {
                            age: Math.floor(Date.now()),
                            type: n,
                            url: s,
                            body: {
                                reportString: E,
                                reportInt: S
                            },
                            "user-agent": (null === (e = window.navigator) || void 0 === e ? void 0 : e.userAgent) || ""
                        };
                    (c || o.ignoreGlobalSample || i.ignoreGlobalSample) && this.pushDataToQueue(m)
                }
            }, {
                key: "constructNewDataWithPrifix",
                value: function(t, e) {
                    var n = {};
                    for (var r in t) {
                        var o = t[r],
                            i = Object.prototype.toString.call(o).slice(8, -1);
                        if ("Array" === i || "Object" === i || "Arguments" === i) try {
                            o = JSON.stringify(o)
                        } catch (t) {} else "Function" !== i && "Symbol" !== i || (o = String(o));
                        n["".concat(e, "_").concat(r)] = o
                    }
                    return n
                }
            }, {
                key: "pushDataToQueue",
                value: function(t) {
                    this.sampleDataQueue.push(t), this.upload()
                }
            }, {
                key: "upload",
                value: (e = u(S().mark((function t() {
                    var e, n = this;
                    return S().wrap((function(t) {
                        for (;;) switch (t.prev = t.next) {
                            case 0:
                                if (e = this.gerReportUrl(), !this.isReporting && e && 0 !== this.sampleDataQueue.length) {
                                    t.next = 3;
                                    break
                                }
                                return t.abrupt("return");
                            case 3:
                                this.isReporting = !0, setTimeout(u(S().mark((function t() {
                                    var r, o, i, a, c, s, u, l;
                                    return S().wrap((function(t) {
                                        for (;;) switch (t.prev = t.next) {
                                            case 0:
                                                if (r = n.config.maxSize, o = n.sampleDataQueue.slice(0, r), i = new ct, o.forEach((function(t) {
                                                        t.body.reportString.uId = z.getUid()
                                                    })), a = o.filter((function(t) {
                                                        return !t.body.reportString.action_encode
                                                    })), c = o.filter((function(t) {
                                                        return t.body.reportString.action_encode
                                                    })), s = [], u = [], l = null, c.forEach((function(t) {
                                                        void 0 !== t.body.reportString.action_payload && ("event" === t.body.reportString.action_encode && (s.push(JSON.parse(t.body.reportString.action_payload)), l = t), "request" === t.body.reportString.action_encode && (u.push(JSON.parse(t.body.reportString.action_payload)), l = t))
                                                    })), i.convertEventListSchema(s), i.convertRequestListSchema(u), l && (l.body.reportString.action_payload = JSON.stringify(i.getResult()), delete l.body.reportString.event_payload, a.push(l)), n.sampleDataQueue = n.sampleDataQueue.slice(r), !rt) {
                                                    t.next = 22;
                                                    break
                                                }
                                                if (nt.call(et, e, JSON.stringify(a))) {
                                                    t.next = 20;
                                                    break
                                                }
                                                return console.log("銆宻endBecon銆峴end send log report error"), t.next = 20, n.logReportByFetch(e, o);
                                            case 20:
                                                t.next = 24;
                                                break;
                                            case 22:
                                                return t.next = 24, n.logReportByFetch(e, o);
                                            case 24:
                                                n.isReporting = !1, n.upload();
                                            case 26:
                                            case "end":
                                                return t.stop()
                                        }
                                    }), t)
                                }))), 1e3 * this.config.timeInterval);
                            case 5:
                            case "end":
                                return t.stop()
                        }
                    }), t, this)
                }))), function() {
                    return e.apply(this, arguments)
                })
            }, {
                key: "logReportByFetch",
                value: (t = u(S().mark((function t(e, n) {
                    return S().wrap((function(t) {
                        for (;;) switch (t.prev = t.next) {
                            case 0:
                                return t.prev = 0, t.next = 3, tt(e, {
                                    method: "post",
                                    mode: "cors",
                                    body: JSON.stringify(n),
                                    headers: {
                                        "Content-Type": "application/json"
                                    }
                                });
                            case 3:
                                t.next = 9;
                                break;
                            case 5:
                                t.prev = 5, t.t0 = t.catch(0), console.log("銆宖etch銆峴end log report error", t.t0), this.sampleDataQueue = n.concat(this.sampleDataQueue);
                            case 9:
                            case "end":
                                return t.stop()
                        }
                    }), t, this, [
                        [0, 5]
                    ])
                }))), function(e, n) {
                    return t.apply(this, arguments)
                })
            }, {
                key: "shouleAddToSampleQueue",
                value: function(t) {
                    var e = t.event,
                        n = t.action,
                        r = this.getMatchedRatio(e, n),
                        o = "object" === O(r) ? r.ratio : r;
                    return o === ot || Math.floor(Math.random() * ot) <= o
                }
            }, {
                key: "setConfig",
                value: function(t) {
                    t && ("Array" === Object.prototype.toString.call(t.sampleRatio).slice(8, -1) && (t.sampleRatio = this.sortSampleRatio(t.sampleRatio)), this.config = E(E({}, this.config), t))
                }
            }, {
                key: "sortSampleRatio",
                value: function(t) {
                    var e = function(t) {
                        var e = 0;
                        return t.actionType && t.eventType ? e = 2 : (t.actionType || t.eventType) && (e = 1), e
                    };
                    return t.sort((function(t, n) {
                        var r = e(t),
                            o = e(n);
                        return r > o ? -1 : r < o ? 1 : 0
                    }))
                }
            }, {
                key: "getMatchedRatio",
                value: function(t, e) {
                    var n = ot,
                        r = this.config.sampleRatio;
                    if (!r) return n;
                    var o = t.name,
                        i = e.type,
                        a = Object.prototype.toString.call(r).slice(8, -1);
                    if ("Object" === a) n = this.matchRatioRule(o, i, r).ratio;
                    else if ("Array" === a)
                        for (var c = r, s = 0, u = c.length; s < u; s++) {
                            var l = this.matchRatioRule(o, i, c[s]),
                                h = l.matched,
                                f = l.ratio;
                            if (h) {
                                n = f;
                                break
                            }
                        }
                    return r
                }
            }, {
                key: "matchRatioRule",
                value: function(t, e, n) {
                    var r = {
                            ratio: ot,
                            matched: !1
                        },
                        o = n.ratio,
                        i = n.eventType,
                        a = n.actionType;
                    return (i && a && t === i && e === a || i && t === i || a && e === a || !i && !a) && (r = {
                        ratio: o,
                        matched: !0
                    }), r
                }
            }]);
            var t, e
        }(),
        ht = new lt,
        ft = function(t) {
            var e = !(arguments.length > 1 && void 0 !== arguments[1]) || arguments[1],
                n = t.action,
                r = t.event;
            ht.report(t), e && D.emit(r, n)
        },
        pt = function(t) {
            var e = t.eventName,
                r = t.payload,
                o = t.reason,
                i = t.strategyKey,
                a = t.errorStack,
                c = t.fromStage,
                s = {
                    name: e,
                    source: $[e],
                    timestamp: Date.now(),
                    pageUrl: location.href,
                    payload: r
                },
                u = {
                    type: n.ERROR,
                    strategyKey: i,
                    reason: o,
                    payload: a
                };
            ft({
                event: s,
                action: u,
                fromStage: c
            })
        },
        dt = function() {
            return f((function t(e, n) {
                l(this, t), this.eventName = void 0, this.payload = void 0, this.eventName = e, this.payload = n
            }), [{
                key: "registEvent",
                value: function() {
                    return {
                        name: this.eventName,
                        source: $[this.eventName],
                        timestamp: Date.now(),
                        log_id: F(),
                        pageUrl: location.href,
                        payload: this.payload
                    }
                }
            }, {
                key: "selection",
                value: function() {
                    var t = Z.loadStrategyMap(),
                        e = Z.loadStrategyGroup() || {};
                    return ((null == e ? void 0 : e[this.eventName]) || []).map((function(e) {
                        return null == t ? void 0 : t[e]
                    })).filter((function(t) {
                        return Boolean(t)
                    })).map((function(t) {
                        return E(E({}, t), {}, {
                            condition: t.condition && "string" == typeof t.condition ? new Function("event", t.condition) : t.condition,
                            expression: t.expression && "string" == typeof t.expression ? new Function("event", t.expression) : t.expression
                        })
                    }))
                }
            }, {
                key: "compute",
                value: function(t, e) {
                    var r = t.key,
                        o = t.condition,
                        i = t.expression,
                        a = t.version;
                    if (!o || "function" != typeof o || o(e)) {
                        var c = Z.loadStrategyConfig(r);
                        if (i && "function" == typeof i) try {
                            var s = i(e);
                            return s.strategyKey = r, s.strategyVersion = a, s.type !== n.PASS && ft({
                                event: e,
                                action: s,
                                fromStage: "compute"
                            }, !1), s
                        } catch (t) {
                            return console.log(t), pt({
                                eventName: this.eventName,
                                strategyKey: r,
                                reason: "绛栫暐璁＄畻寮傚父",
                                payload: e.payload,
                                errorStack: {
                                    config: c,
                                    name: t.name,
                                    message: t.message,
                                    detail: t.detail
                                },
                                fromStage: "compute"
                            }), {
                                type: n.PASS,
                                reason: "".concat(r, "绛栫暐鎵ц寮傚父")
                            }
                        }
                    }
                }
            }, {
                key: "execute",
                value: function(t, e) {
                    var r, o, i = [],
                        a = t.filter((function(t) {
                            return t.type === n.BLOCK
                        })),
                        c = t.filter((function(t) {
                            return t.type === n.REWRITE
                        })),
                        s = t.filter((function(t) {
                            return t.type === n.REPORT_ONLY
                        })),
                        u = t.filter((function(t) {
                            return t.type === n.PASS
                        }));
                    (a.length > 0 ? i = [a[0]] : c.length > 0 ? i = c : u.length > 0 && (i = [u[0]]), s.length > 0) && (r = i).push.apply(r, m(s));
                    i = i.filter((function(t) {
                        return t
                    }));
                    for (var l = !1, h = k("coreLoader"), f = 0; f < i.length; f++) {
                        var p = k("strategy").execution,
                            d = i[f],
                            v = Z.loadStrategyConfig(d.strategyKey),
                            y = {
                                decisionName: this.eventName,
                                strategyName: d.strategyKey,
                                strategyVersion: d.strategyVersion,
                                actionType: d.type,
                                functionName: p[this.eventName]
                            };
                        try {
                            if (!p[this.eventName]) continue;
                            var E = performance.now();
                            if (o = k(p[this.eventName])(e, d, f === i.length - 1), d.type !== n.PASS) {
                                d.report && ft({
                                    event: e,
                                    action: d,
                                    fromStage: "execute"
                                }, !1);
                                var g = performance.now();
                                null == h || h.emitMetrics(N.latency, g - E, y)
                            }
                        } catch (t) {
                            null == h || h.emitMetrics(N.errorNum, 1, y), l = f === i.length - 1, pt({
                                eventName: this.eventName,
                                strategyKey: d.strategyKey,
                                reason: "绛栫暐鎵ц寮傚父",
                                payload: e.payload,
                                errorStack: {
                                    config: v,
                                    name: t.name,
                                    message: t.message,
                                    detail: t.detail
                                },
                                fromStage: "execute"
                            })
                        }
                    }
                    var S = e.payload,
                        _ = S.originFn,
                        O = S.args,
                        T = S.context;
                    return (0 === i.length || l) && _ ? _.apply(T, O) : o
                }
            }, {
                key: "run",
                value: function() {
                    var t, e = this.registEvent(),
                        n = this.selection(),
                        r = [],
                        o = k("coreLoader"),
                        i = p(n);
                    try {
                        for (i.s(); !(t = i.n()).done;) {
                            var a = t.value,
                                c = {
                                    decisionName: this.eventName,
                                    strategyName: a.key,
                                    strategyVersion: a.version,
                                    actionType: ""
                                };
                            try {
                                var s = performance.now(),
                                    u = this.compute(a, e);
                                c.actionType = null == u ? void 0 : u.type, u && r.push(u);
                                var l = performance.now();
                                null == o || o.emitMetrics(I.latency, l - s, c)
                            } catch (t) {
                                null == o || o.emitMetrics(I.errorNum, 1, c)
                            }
                        }
                    } catch (t) {
                        i.e(t)
                    } finally {
                        i.f()
                    }
                    return this.execute(r, e)
                }
            }])
        }(),
        vt = function(t, e) {
            if (0 === e) return t;
            var n = null;
            return function() {
                var r = arguments,
                    o = this;
                n || (n = setTimeout((function() {
                    t.apply(o, r), n = null
                }), e))
            }
        },
        yt = function(e, n, r) {
            var o = arguments.length > 3 && void 0 !== arguments[3] ? arguments[3] : 0;
            if (!n || n.fn) {
                if (!n) {
                    var i = {
                        handle: function() {}
                    };
                    n = {
                        object: i,
                        fn: i.handle,
                        fnName: "handle"
                    }
                }
                var a = n,
                    c = a.object,
                    s = a.fn,
                    u = a.fnName;
                return x(e, c, s), u && (c[u] = vt(l, o)), vt(l, o)
            }

            function l() {
                var n = this,
                    o = [];
                for (var i in arguments) o.push(arguments[i]);
                if ((this === sessionStorage && u && (e = "getItem" === u ? t.API_SESSIONSTORAGE_GET : t.API_SESSIONSTORAGE_SET), this === localStorage && u && (e = "getItem" === u ? t.API_LOCALSTORAGE_GET : t.API_LOCALSTORAGE_SET), e === t.PERFORMANCE_OBSERVER && o[0]) && !o[0].getEntries().filter((function(t) {
                        if (t instanceof PerformanceResourceTiming) {
                            var e = t.name;
                            if (!e) return !0;
                            var n = ht.gerReportUrl();
                            try {
                                var r = new URL(e);
                                return !n.startsWith("".concat(r.protocol, "//").concat(r.host).concat(r.pathname))
                            } catch (t) {
                                return !1
                            }
                        }
                        return !0
                    })).length) return;
                var a = r && r.apply(n, o) || {},
                    c = Object.assign({
                        context: n,
                        args: o,
                        originFn: s
                    }, a),
                    l = k("coreLoader");
                try {
                    var h = performance.now(),
                        f = new dt(e, c).run(),
                        p = performance.now();
                    return null == l || l.emitMetrics(A.latency, p - h, {
                        decisionName: e
                    }), f
                } catch (t) {
                    return null == l || l.emitMetrics(A.errorNum, 1, {
                        decisionName: e
                    }), pt({
                        eventName: e,
                        payload: c,
                        reason: "绛栫暐寮曟搸鎵ц寮傚父",
                        errorStack: t,
                        fromStage: "select"
                    }), s.apply(n, o)
                }
            }
        },
        Et = function(t, e, n) {
            for (var r = e.split("."), o = 0, i = [window]; o < i.length; o++) {
                var a, c = i[o],
                    s = r[r.length - 1],
                    u = c,
                    l = p(r);
                try {
                    for (l.s(); !(a = l.n()).done;) {
                        var h = a.value;
                        if (u = c, !(c = c[h])) return
                    }
                } catch (t) {
                    l.e(t)
                } finally {
                    l.f()
                }
                try {
                    yt(t, {
                        object: u,
                        fn: c,
                        fnName: s
                    }, n)
                } catch (t) {
                    console.error("createAspectByPath error", t)
                }
            }
        };
    Et(t.API_LOCALSTORAGE_SET, "Storage.prototype.setItem", (function(t, e) {
        return {
            key: t,
            value: e
        }
    })), Et(t.API_LOCALSTORAGE_GET, "Storage.prototype.getItem", (function(t) {
        return {
            key: t
        }
    }));
    var gt = function(t) {
        var e = t.split("."),
            n = window;
        return e.every((function(t) {
            return n = n[t], Boolean(n)
        }))
    };
    gt("Clipboard") && (Et(t.CLIPBOARD_WRITE_TEXT, "Clipboard.prototype.write", (function() {
        return {}
    })), Et(t.CLIPBOARD_READ_TEXT, "Clipboard.prototype.read", (function() {
        return {}
    })), Et(t.CLIPBOARD_WRITE_TEXT, "Clipboard.prototype.writeText", (function() {
        return {}
    })), Et(t.CLIPBOARD_READ_TEXT, "Clipboard.prototype.readText", (function() {
        return {}
    }))), gt("document.execCommand") && Et(t.EXCU_COMMAND, "document.execCommand", (function() {
        return {}
    })), Et(t.REQUEST_FILE_STSTEM, "requestFileSystem", (function() {
        return {}
    })), Et(t.GEOLOCATION_CURRENT_POSITION, "Geolocation.prototype.getCurrentPosition", (function() {
        return {}
    })), Et(t.GEOLOCATION_WATCH_POSITION, "Geolocation.prototype.watchPosition", (function() {
        return {}
    })), Et(t.INDEXDB_ADD, "IDBObjectStore.prototype.add", (function() {
        return {}
    })), Et(t.INDEXDB_PUT, "IDBObjectStore.prototype.put", (function() {
        return {}
    })), Et(t.INDEXDB_UPDATE, "IDBCursor.prototype.update", (function() {
        return {}
    })), Et(t.MEDIADEVICES_GETUSERMEDIA, "MediaDevices.prototype.getUserMedia", (function() {
        return {}
    })), Et(t.NAVIGATOR_SEND_BEACON, "Navigator.prototype.sendBeacon", (function() {
        return {}
    }));
    window.postMessage.toString().includes("function postMessage() { [native code] }") && Et(t.POST_MESSAGE, "window.postMessage", (function() {
        return {}
    })), Et(t.OPEN, "window.open", (function() {
        return {}
    })), x(t.FETCH_REQUEST, window, tt);
    var St = "Request" in window,
        mt = "Headers" in window;

    function _t(t) {
        if (t.nodeType === Node.TEXT_NODE) return null;
        if (t.nodeType === Node.ELEMENT_NODE) {
            var e = {};
            Array.from(t.attributes).forEach((function(t) {
                var n = t.name,
                    r = t.value;
                e[n] = r
            }));
            var n = [];
            return Array.from(t.childNodes).forEach((function(t) {
                var e = _t(t);
                e && n.push(e)
            })), d(d(d({}, "name", t.tagName.toLowerCase()), "attrs", e), "children", n)
        }
        return null
    }
    window.fetch = function(e, n) {
            var r = {
                onRequest: function(e, n) {
                    return tt.apply(window, [e, n]).then((function(e) {
                        return 200 === e.status && yt(t.FETCH_RESPONSE, {
                            object: r,
                            fn: r.onResponse,
                            fnName: "onResponse"
                        }, (function(t) {
                            return {
                                _headers: function(t) {
                                    for (var e, n = t.headers.entries(), r = {};
                                        (e = n.next()) && (e.value && (r[e.value[0]] = e.value[1]), !e.done););
                                    return r
                                }(t),
                                response: t
                            }
                        })), r.onResponse.apply(window, [e])
                    }))
                },
                onResponse: function(t) {
                    return t
                }
            };
            return yt(t.FETCH_REQUEST, {
                object: r,
                fn: r.onRequest,
                fnName: "onRequest"
            }, (function(e, n) {
                var r, o = "",
                    i = "",
                    a = n && n.body;
                St && e instanceof Request ? (o = e.url, i = e.method, r = e.headers.set.bind(e.headers)) : (o = e, i = n && n.method ? n.method : "GET", (n = n || {}).headers = n.headers || {}, r = mt && n.headers instanceof Headers ? n.headers.set.bind(n.headers) : Array.isArray(n.headers) ? function(t, e) {
                    var r, o, i = !1;
                    ((null === (r = n) || void 0 === r ? void 0 : r.headers).forEach((function(n) {
                        n[0] === t && (n[1] = e, i = !0)
                    })), i) || (null === (o = n) || void 0 === o ? void 0 : o.headers).push([t, e])
                } : function(t, e) {
                    var r, o, i = (null === (r = n) || void 0 === r ? void 0 : r.headers)[t];
                    (null === (o = n) || void 0 === o ? void 0 : o.headers)[t] = i ? "".concat(i, ", ").concat(e) : e
                });
                var c = {
                    url: o,
                    method: i,
                    body: a,
                    init: n,
                    input: e,
                    __secReqHeaders: {},
                    addHeader: r
                };
                return c.addHeader = yt(t.FETCH_ADDHEADER, {
                    object: {},
                    fn: r,
                    fnName: "addHeader"
                }, (function(t, e) {
                    return e && t ? (void 0 === c.__secReqHeaders[t] ? c.__secReqHeaders[t] = e : c.__secReqHeaders[t] = "".concat(c.__secReqHeaders[t], ", ").concat(e), {}) : {}
                })), c
            })), r.onRequest(e, n)
        }, Et(t.XHR_REQUEST_OPEN, "XMLHttpRequest.prototype.open", (function(t, e, n) {
            var r = this;
            r._xhr_open_args || (r._xhr_open_args = {}), Object.assign(r._xhr_open_args, {
                method: t,
                url: e,
                isAsync: n
            })
        })), Et(t.XHR_REQUEST_SETQEQUESTHEADER, "XMLHttpRequest.prototype.setRequestHeader", (function(t, e) {
            if (!e || !t) return {};
            var n = this;
            return n._xhr_headers = n.__secReqHeaders = n.__secReqHeaders || {}, void 0 === n.__secReqHeaders[t] ? n.__secReqHeaders[t] = e : n.__secReqHeaders[t] = "".concat(n.__secReqHeaders[t], ", ").concat(e), {}
        })), Et(t.XHR_REQUEST_SEND, "XMLHttpRequest.prototype.send", (function() {
            var e = this,
                n = function(n) {
                    var r = n.toUpperCase(),
                        o = "on".concat(n),
                        i = e[o];
                    i && (e[o] = function() {
                        if (e.readyState === XMLHttpRequest.DONE && 200 === e.status) {
                            var n = yt(t["XHR_RESPONSE_".concat(r)], {
                                object: e,
                                fn: i,
                                fnName: null
                            }, (function() {}));
                            return null == n ? void 0 : n.apply(e, arguments)
                        }
                        i && i.apply(e, arguments)
                    })
                };
            n("readystatechange"), n("loadend")
        })),
        function() {
            var t, e = p(w);
            try {
                var n = function() {
                    var e = t.value,
                        n = yt(e.toUpperCase(), null, (function(t) {
                            return {
                                reportData: {
                                    name: e,
                                    target: _t(t.target),
                                    timestamp: Date.now(),
                                    axis: {
                                        x: t.clientX + t.scrollX,
                                        y: t.clientY + t.scrollY
                                    },
                                    payload: t.target.value
                                }
                            }
                        }), 0);
                    window.addEventListener(e, n)
                };
                for (e.s(); !(t = e.n()).done;) n()
            } catch (t) {
                e.e(t)
            } finally {
                e.f()
            }
            var r, o = p(b);
            try {
                var i = function() {
                    var t = r.value,
                        e = yt(t.toUpperCase(), null, (function(e) {
                            return {
                                reportData: {
                                    name: t,
                                    target: _t(e.target),
                                    timestamp: Date.now(),
                                    axis: {
                                        x: e.clientX + e.scrollX,
                                        y: e.clientY + e.scrollY
                                    },
                                    payload: e.target.value
                                }
                            }
                        }), 100);
                    window.addEventListener(t, e)
                };
                for (o.s(); !(r = o.n()).done;) i()
            } catch (t) {
                o.e(t)
            } finally {
                o.f()
            }
        }();
    var Ot = window,
        Tt = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function(e, n, r) {
        if (e !== t.MESSAGE.toLowerCase()) return Tt.call(this, e, n, r);
        var o = yt(t.MESSAGE, {
            object: Ot,
            fn: n,
            fnName: "listener"
        }, (function(t) {
            return {}
        }), 0);
        Tt.call(this, e, o, r)
    };
    var Rt = {
            attributes: !1,
            childList: !0,
            subtree: !0
        },
        At = yt(t.MUTATION_OBSERVER, {
            object: window,
            fn: function() {
                for (var e = window.frames, n = 0; n < e.length; n++) {
                    var r = e[n];
                    r.contentWindow && r.contentWindow.postMessage.toString().includes("function postMessage() { [native code] }") && Et(t.POST_MESSAGE, {
                        object: r.contentWindow,
                        fn: r.contentWindow.postMessage,
                        fnName: "postMessage"
                    }, (function() {
                        return {}
                    }))
                }
            },
            fnName: "mutationCallback"
        }, (function() {
            return {}
        }));
    window.addEventListener("DOMContentLoaded", (function() {
        var t = document.body;
        gt("MutationObserver") && new MutationObserver(At).observe(t, Rt)
    }));
    var It = yt(t.PERFORMANCE_OBSERVER, null, (function() {
        return {}
    }));
    gt("PerformanceObserver") && new PerformanceObserver(It).observe({
        entryTypes: ["element", "event", "navigation", "resource"]
    });
    var Nt = function(e, n, r, o, i) {
        var c = H(t.FETCH_REQUEST),
            s = window.fetch;
        c && (s = c.fn.bind(c.context));
        var u = U("web_security_runtime_cache_".concat(e)),
            l = "".concat(e),
            h = l.includes("gray") ? "gray" : "online";
        if (u) G(u);
        else {
            var f = performance.now();
            i ? document.writeln('<script nonce="'.concat(i, '" src="').concat(l, '"><\/script>')) : document.writeln('<script src="'.concat(l, '"><\/script>'));
            var p = performance.now();
            a(R.latency, p - f, {
                projectId: r,
                env: h,
                name: n,
                sdkVersion: o
            })
        }
        var d = performance.now();
        s(e).then((function(t) {
            return t.text()
        })).then((function(t) {
            var e = performance.now();
            a(R.latency, e - d, {
                projectId: r,
                env: h,
                name: n,
                sdkVersion: o
            }), X("web_security_runtime_cache_".concat(l), t);
            try {
                G(t)
            } catch (t) {}
        })).catch((function() {
            a(R.errorNum, 1, {
                projectId: r,
                env: h,
                name: n,
                sdkVersion: o
            })
        }))
    };
    new(function() {
        return f((function t() {
            var e, n;
            l(this, t), this.projectId = void 0, this.nonce = void 0, this.version = "1.0.30", this.host = "", this.customReportHost = void 0, this.reporter = void 0, this.isLocal = !1, this.isGray = !1, this.uid = "", this.isBundler = !1;
            var r = null === (e = document.currentScript) || void 0 === e ? void 0 : e.getAttribute("src");
            if (r) {
                this.emitInitReport();
                var o = document.currentScript.getAttribute("project-id"),
                    i = document.currentScript.getAttribute("custom-report-host"),
                    a = localStorage.getItem("web_runtime_switcher_isgray");
                if (this.isGray = "true" === a, this.customReportHost = i, this.nonce = (null === (n = document.currentScript) || void 0 === n ? void 0 : n.nonce) || this.nonce, r.includes("./dist")) this.isLocal = !0;
                else {
                    var c = new URL(r, window.location.href).host;
                    this.host = c
                }
                this.isBundler = r.includes("bundler"), this.projectId = o, this.reporter = ht, M("coreLoader", this), r.includes("runtime_bundler") || r.includes("test") || this.init()
            }
        }), [{
            key: "init",
            value: function() {
                z.loadUid(), this.uid = z.getUid();
                var t = this.isGray ? "-gray" : "";
                this.loadConfigModule(t), this.initOriginModule()
            }
        }, {
            key: "setUid",
            value: function(t) {
                this.uid = t, z.setUid(t)
            }
        }, {
            key: "emitInitReport",
            value: function() {
                ht.report({
                    event: {
                        name: t.SDK_REPORT_INIT,
                        source: e.REPORT_CONFIG_SET,
                        pageUrl: window.location.href,
                        payload: {},
                        timestamp: Date.now()
                    },
                    action: {
                        type: n.REPORT_ONLY,
                        payload: {}
                    }
                })
            }
        }, {
            key: "initReportStrategy",
            value: function() {
                var e = k("strategy");
                if (e.strategy.report) {
                    var n = e.strategy.report;
                    ht.setConfig(n.config), this.emitInitReport();
                    try {
                        new dt(t.SDK_INIT, {}).run()
                    } catch (e) {
                        pt({
                            eventName: t.SDK_INIT,
                            payload: {},
                            reason: "绛栫暐寮曟搸鎵ц寮傚父",
                            errorStack: e,
                            fromStage: "select"
                        })
                    }
                    setTimeout((function() {
                        try {
                            new dt(t.CONTENT_LOADED, {}).run()
                        } catch (e) {
                            pt({
                                eventName: t.CONTENT_LOADED,
                                payload: {},
                                reason: "绛栫暐寮曟搸鎵ц寮傚父",
                                errorStack: e,
                                fromStage: "select"
                            })
                        }
                    }), 3e3)
                }
            }
        }, {
            key: "emitMetrics",
            value: function(t, e, n) {
                var r, o = k("globalConfig");
                if (o && null != o && null !== (r = o.strategy) && void 0 !== r && r.monitor) {
                    var i = o.strategy.monitor.config.sampleRatio,
                        c = void 0 === i ? 0 : i;
                    1e4 * Math.random() < c && a(t, e, E(E({}, n), {}, {
                        projectId: this.projectId,
                        env: this.isGray ? "gray" : "online",
                        sdkVersion: this.version
                    }))
                }
            }
        }, {
            key: "initOriginModule",
            value: function() {
                var t, e = k("globalConfig");
                if (!e && !this.isGray) return this.loadCommonModule(""), void this.loadStrategyModule("");
                var r = !1;
                if (null != e && null !== (t = e.strategy) && void 0 !== t && t.hitGray) {
                    var o = e.strategy.hitGray;
                    r = ("string" == typeof o.body.expression ? G(o.body.expression) : o.body.expression()).type === n.REWRITE
                }
                var i = this.isGray || r ? "-gray" : "";
                this.loadCommonModule(i), this.loadStrategyModule(i)
            }
        }, {
            key: "loadConfigModule",
            value: function(t) {
                if (this.isLocal) Nt("./dist/config_".concat(this.projectId, ".js"), "config", this.projectId, this.version, this.nonce);
                else {
                    if (this.host && this.host.includes("sf")) return void Nt("https://".concat(this.host, "/obj/secsdk").concat(t, "-sg/config_").concat(this.projectId, ".js"), "config", this.projectId, this.version, this.nonce);
                    Nt("https://".concat(this.host, "/obj/security-secsdk").concat(t, "/config_").concat(this.projectId, ".js"), "config", this.projectId, this.version, this.nonce)
                }
            }
        }, {
            key: "loadCommonModule",
            value: function(t) {
                if (this.isLocal) Nt("./dist/project_".concat(this.projectId, ".js"), "project", this.projectId, this.version, this.nonce);
                else {
                    if (this.host && this.host.includes("sf")) return void Nt("https://".concat(this.host, "/obj/secsdk").concat(t, "-sg/project_").concat(this.projectId, ".js"), "config", this.projectId, this.version, this.nonce);
                    Nt("https://".concat(this.host, "/obj/security-secsdk").concat(t, "/project_").concat(this.projectId, ".js"), "project", this.projectId, this.version, this.nonce)
                }
            }
        }, {
            key: "loadStrategyModule",
            value: function(t) {
                if (this.isLocal) Nt("./dist/strategy_".concat(this.projectId, ".js"), "strategy", this.projectId, this.version, this.nonce);
                else {
                    if (this.host && this.host.includes("sf")) return void Nt("https://".concat(this.host, "/obj/secsdk").concat(t, "-sg/strategy_").concat(this.projectId, ".js"), "config", this.projectId, this.version, this.nonce);
                    Nt("https://".concat(this.host, "/obj/security-secsdk").concat(t, "/strategy_").concat(this.projectId, ".js?v=1"), "strategy", this.projectId, this.version, this.nonce)
                }
            }
        }])
    }())
}));
window.registToModule("executeFetchRequest", function(a, b, c, d, e) {
    "use strict";
    var __defProp = Object.defineProperty;
    var __getOwnPropSymbols = Object.getOwnPropertySymbols;
    var __hasOwnProp = Object.prototype.hasOwnProperty;
    var __propIsEnum = Object.prototype.propertyIsEnumerable;
    var __defNormalProp = (obj, key, value) =>
        key in obj ?
        __defProp(obj, key, {
            enumerable: true,
            configurable: true,
            writable: true,
            value,
        }) :
        (obj[key] = value);
    var __spreadValues = (a, b) => {
        for (var prop in b || (b = {}))
            if (__hasOwnProp.call(b, prop)) __defNormalProp(a, prop, b[prop]);
        if (__getOwnPropSymbols)
            for (var prop of __getOwnPropSymbols(b)) {
                if (__propIsEnum.call(b, prop)) __defNormalProp(a, prop, b[prop]);
            }
        return a;
    };

    function main(event, action, end) {
        const {
            payload
        } = event;
        const ActionType = window.use("ActionType");
        const {
            type
        } = action;
        if (action.strategyKey === "csrfWebToken" && type === ActionType.REWRITE) {
            const headers = new Headers(payload.context.headers);
            if (!headers.has("x-secsdk-csrf-token")) {
                payload.addHeader("x-secsdk-csrf-token", "DOWNGRADE");
            }
        }
        if (
            action.strategyKey === "sensitiveEncrypt" &&
            type === ActionType.REWRITE
        ) {
            const {
                checkBodyLimit,
                encryptInfo
            } = window.use(
                "appLogCryptoConfigMatch",
            )();
            const {
                payload: actionPayload
            } = action;
            if (actionPayload.config.match) {
                const encryptRequest = encryptInfo(
                    __spreadValues({
                            url: new URL(payload.url, window.location.href),
                            method: payload.method,
                            body: payload.body,
                        },
                        actionPayload.config,
                    ),
                );
                for (const header of Object.keys(encryptRequest.headers)) {
                    payload.addHeader(header, encryptRequest.headers[header]);
                }
                payload.args[0] = encryptRequest.url;
                const requestConfig = payload.args[1];
                if (requestConfig) {
                    requestConfig.body = encryptRequest.body;
                }
            }
        }
        if (end) {
            return payload.originFn.apply(payload.context, payload.args);
        }
    }
    return typeof main !== "undefined" && main(a, b, c, d, e);
});
window.registToModule("executePostMessage", function(a, b, c, d, e) {
    "use strict";

    function main(event, action, end) {
        const ActionType = window.use("ActionType");
        const {
            payload
        } = event;
        if (end && action.type === ActionType.BLOCK) {
            console.error("origin not available");
            return;
        }
        if (end) {
            return payload.originFn.apply(payload.context, payload.args);
        }
    }
    return typeof main !== "undefined" && main(a, b, c, d, e);
});
window.registToModule("executeXHRRequestSend", function(a, b, c, d, e) {
    "use strict";
    var __defProp = Object.defineProperty;
    var __getOwnPropSymbols = Object.getOwnPropertySymbols;
    var __hasOwnProp = Object.prototype.hasOwnProperty;
    var __propIsEnum = Object.prototype.propertyIsEnumerable;
    var __defNormalProp = (obj, key, value) =>
        key in obj ?
        __defProp(obj, key, {
            enumerable: true,
            configurable: true,
            writable: true,
            value,
        }) :
        (obj[key] = value);
    var __spreadValues = (a, b) => {
        for (var prop in b || (b = {}))
            if (__hasOwnProp.call(b, prop)) __defNormalProp(a, prop, b[prop]);
        if (__getOwnPropSymbols)
            for (var prop of __getOwnPropSymbols(b)) {
                if (__propIsEnum.call(b, prop)) __defNormalProp(a, prop, b[prop]);
            }
        return a;
    };

    function main(event, action, end) {
        const {
            payload
        } = event;
        const ActionType = window.use("ActionType");
        const {
            type
        } = action;
        if (action.strategyKey === "csrfWebToken" && type === ActionType.REWRITE) {
            const headers = payload.context.__secReqHeaders || {};
            if (!headers["x-secsdk-csrf-token"]) {
                payload.context.setRequestHeader("x-secsdk-csrf-token", "DOWNGRADE");
                payload.context.__secReqHeaders = headers;
                payload.context.__secReqHeaders["x-secsdk-csrf-token"] = "DOWNGRADE";
            }
        }
        if (
            action.strategyKey === "sensitiveEncrypt" &&
            type === ActionType.REWRITE
        ) {
            const encryptVersionHeader = "x-tt-cipher-version";
            const {
                checkBodyLimit,
                encryptInfo
            } = window.use(
                "appLogCryptoConfigMatch",
            )();
            const {
                config,
                url,
                method
            } = action.payload;
            const headers = event.payload.context.__secReqHeaders || {};
            if (!headers[encryptVersionHeader] && config.match) {
                try {
                    const encryptRequest = encryptInfo(
                        __spreadValues({
                                url: new URL(url, window.location.href),
                                method,
                                body: event.payload.args[0],
                            },
                            config,
                        ),
                    );
                    if (encryptRequest) {
                        event.payload.args[0] = encryptRequest.body;
                        const {
                            headers: headers2
                        } = encryptRequest;
                        for (const header of Object.keys(headers2)) {
                            event.payload.context.SDKNativeWebApi[
                                "XHR_REQUEST_SETQEQUESTHEADER"
                            ].fn.call(event.payload.context, header, headers2[header]);
                            event.payload.context.__secReqHeaders = headers2;
                            event.payload.context.__secReqHeaders[header] = headers2[header];
                        }
                    }
                } catch (e) {
                    console.log(e);
                }
            }
        }
        if (end) {
            return payload.originFn.apply(payload.context, payload.args);
        }
    }
    return typeof main !== "undefined" && main(a, b, c, d, e);
});
window.registToModule("exexcuteMessage", function(a, b, c, d, e) {
    "use strict";

    function main(event, action, end) {
        const ActionType = window.use("ActionType");
        const {
            payload
        } = event;
        if (end && action.type === ActionType.BLOCK) {
            console.error("origin not available");
            return;
        }
        if (end) {
            return payload.originFn.apply(payload.context, payload.args);
        }
    }
    return typeof main !== "undefined" && main(a, b, c, d, e);
});
window.registToModule("strategy", {
    event: {
        FETCH_REQUEST: ["csrfWebToken"],
        MESSAGE: ["postMessageOriginCheck"],
        POST_MESSAGE: ["postMessageOriginCheck"],
        XHR_REQUEST_SEND: ["csrfWebToken"],
    },
    strategy: {
        csrfWebToken: {
            body: {
                singleKey: "csrfWebToken",
                version: "1.0.8",
                createdAt: "2025-07-30T12:22:09.000Z",
                latest: 0,
                strategyKey: "csrfWebToken",
                key: "csrfWebToken",
                disabled: false,
                condition: "return true;",
                expression: '"use strict";\nfunction main(event) {\n  var _a;\n  const matchConfig = (config2, host, method2, pathname) => {\n    method2 = method2.toUpperCase();\n    const pc = config2;\n    if (!pc[host]) {\n      return false;\n    }\n    if (!pc[host][method2]) {\n      return false;\n    }\n    const mpc = pc[host][method2];\n    if (mpc instanceof RegExp) {\n      return mpc.test(pathname);\n    } else if (Array.isArray(mpc)) {\n      return mpc.some((item) => {\n        if (item === "*")\n          return true;\n        if (item === pathname)\n          return true;\n        const regExp = new RegExp(item);\n        return regExp.test(pathname);\n      });\n    }\n    return mpc === "*" || mpc === pathname;\n  };\n  const { config } = window.use("strategy").strategy.csrfWebToken;\n  const { protectedHost, allowedHost } = config;\n  const ActionType = SDKRuntime.require("ActionType");\n  const { payload } = event;\n  const { context } = payload;\n  const method = payload.method || ((_a = context._xhr_open_args) == null ? void 0 : _a.method);\n  if (!method) {\n    return {\n      type: ActionType.PASS,\n      payload: {}\n    };\n  }\n  const { url } = event.payload.context._xhr_open_args || event.payload;\n  const u = new URL(url, window.location.href);\n  const key = `${method}: ${u.host}/${u.pathname}`;\n  if (allowedHost && matchConfig(allowedHost, u.host, method, u.pathname)) {\n    return {\n      type: ActionType.REPORT_ONLY,\n      key,\n      once: true,\n      payload: {}\n    };\n  }\n  const matchResult = matchConfig(protectedHost, u.host, method, u.pathname);\n  return {\n    type: matchResult ? ActionType.REWRITE : ActionType.PASS,\n    key,\n    once: true,\n    payload: {}\n  };\n}\n;return main(event);',
            },
            config: {
                protectedHost: {},
                allowedHost: {},
            },
        },
        postMessageOriginCheck: {
            body: {
                singleKey: "postMessageOriginCheck",
                version: "10",
                createdAt: "2026-02-27T07:07:05.000Z",
                latest: 0,
                strategyKey: "postMessageOriginCheck",
                key: "postMessageOriginCheck",
                disabled: false,
                condition: "return true;",
                expression: '"use strict";\nfunction main(event) {\n  const { config } = window.use("strategy").strategy.postMessageOriginCheck;\n  const { allowedHost, block } = config;\n  const ActionType = window.use("ActionType");\n  const { payload } = event;\n  const { context, args } = payload;\n  const option = event.name === "POST_MESSAGE" ? payload.args[1] : payload.args[0].origin;\n  let targetOrigin = null;\n  if (option && typeof option === "object") {\n    targetOrigin = option.targetOrigin;\n  } else if (option) {\n    targetOrigin = option;\n  }\n  const match = () => {\n    try {\n      if (!targetOrigin) {\n        return false;\n      }\n      const url = new URL(targetOrigin, window.location.href); if (url.origin === new URL(window.location.href).origin) { return true; } \n      const { host } = url;\n      for (const h of allowedHost) {\n        const groups = h.split(".");\n        let i = groups.length - 1;\n        const hostGroups = host.split(".");\n        let j = hostGroups.length - 1;\n        if (i != j) {\n          continue;\n        }\n        while (i >= 0) {\n          if (groups[j] !== "*" && groups[j] !== "" && hostGroups[j] != groups[i]) {\n            break;\n          }\n          i--;\n          j--;\n        }\n        if (i === -1) {\n          return true;\n        }\n      }\n      return false;\n    } catch (e) {\n      return false;\n    }\n  };\n  const matchResult = match();\n  if (matchResult) {\n    return {\n      type: ActionType.PASS,\n      payload: {}\n    };\n  }\n  return {\n    type: block ? ActionType.BLOCK : ActionType.REPORT_ONLY,\n    key: event.name === "POST_MESSAGE" ? `postMessage: ${window.location.href} -> ${targetOrigin.toString()}` : `onMessage: ${targetOrigin.toString()} -> ${window.location.href}`,\n    payload: {}\n  };\n}\n;return main(event);',
            },
            config: {
                block: false,
                allowedHost: [
                    "*.tiktok.com"
                ],
            },
        },
        report: {
            body: {
                singleKey: "report",
                version: "1.0.2",
                createdAt: "2025-05-29T12:26:32.000Z",
                latest: 0,
                strategyKey: "report",
                key: "report",
                disabled: false,
                condition: "true",
                expression: '"use strict";\nfunction main() {\n  return true;\n}\n;return main(event);',
            },
            config: {
                bid: "tiktok_secbp"
            },
        },
    },
    execution: {
        FETCH_REQUEST: "executeFetchRequest",
        MESSAGE: "exexcuteMessage",
        POST_MESSAGE: "executePostMessage",
        XHR_REQUEST_SEND: "executeXHRRequestSend",
    },
});
window.registToModule("globalConfig", {
    strategy: {
        hitGray: {
            body: {
                singleKey: "hitGray",
                version: "1.0.4",
                createdAt: "2025-07-30T06:47:00.000Z",
                latest: 0,
                strategyKey: "hitGray",
                key: "hitGray",
                disabled: false,
                condition: "true",
                expression: '"use strict";\nfunction main(n) {\n  const { config } = window.use("globalConfig").strategy.hitGray;\n  const ActionType = window.use("ActionType");\n  const { selectors, sampleRatio } = config;\n  const result = [];\n  const matchResult = (selector) => {\n    const { path, value, op } = selector;\n    let cur = window;\n    const paths = path.split(".");\n    let count = 0;\n    for (const key of paths) {\n      if (cur) {\n        count++;\n        cur = cur[key];\n      }\n    }\n    if (window !== cur && count === paths.length) {\n      if (op === "===") {\n        return cur === value;\n      } else if (op === "!==") {\n        return cur !== value;\n      }\n    }\n    return false;\n  };\n  for (const selector of selectors) {\n    if (Array.isArray(selector)) {\n      result.push(selector.every(matchResult));\n    } else {\n      result.push(matchResult(selector));\n    }\n  }\n  if (Math.floor(Math.random() * 1e4) < sampleRatio) {\n    result.push(true);\n  }\n  return { type: result.length > 0 && result.some((v) => v) ? ActionType.REWRITE : ActionType.PASS };\n}\n;return main(event);',
            },
            config: {
                selectors: [
                    [{
                            path: "gfdatav1.env",
                            value: "prod",
                            op: "==="
                        },
                        {
                            path: "gfdatav1.envName",
                            value: "canary",
                            op: "!=="
                        },
                        {
                            path: "gfdatav1.envName",
                            value: "prod",
                            op: "!=="
                        },
                    ],
                    {
                        path: "gfdatav1.env",
                        value: "boe",
                        op: "==="
                    },
                ],
                sampleRatio: 500,
            },
        },
        monitor: {
            config: {
                sampleRatio: 10000
            }
        },
    },
});