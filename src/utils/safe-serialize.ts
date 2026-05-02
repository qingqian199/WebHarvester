/**
 * 安全提取页面 __INITIAL_STATE__。
 * 只返回基本类型字段，绝不访问深层对象属性。
 */
import { PlaywrightAdapter } from "../adapters/PlaywrightAdapter";

export async function safeExtractInitialState(browser: PlaywrightAdapter): Promise<Record<string, any>> {
  try {
    const data = await browser.executeScript<string>(`(() => {
      var result = { _hasData: false };
      try {
        var st = window.__INITIAL_STATE__ || {};
        // 只通过字符串路径安全取值，绝不直接访问对象引用
        var get = function(obj, path) {
          try {
            var parts = path.split('.');
            var cur = obj;
            for (var i = 0; i < parts.length; i++) {
              if (cur == null || typeof cur !== 'object') return undefined;
              cur = cur[parts[i]];
            }
            // 只返回基本类型
            if (typeof cur === 'string' || typeof cur === 'number' || typeof cur === 'boolean') return cur;
            if (cur === null || cur === undefined) return undefined;
            // 如果是对象，尝试 JSON roundtrip
            try { return JSON.parse(JSON.stringify(cur)); } catch(e) { return undefined; }
          } catch(e) { return undefined; }
        };
        var getStr = function(obj, path) { var v = get(obj, path); return (typeof v === 'string') ? v : ''; };
        var getNum = function(obj, path) { var v = get(obj, path); return (typeof v === 'number') ? v : 0; };

        // 笔记详情
        var firstNoteKey = get(st, 'note.noteDetailMap');
        if (typeof firstNoteKey === 'object' && firstNoteKey !== null) {
          var keys = Object.keys(firstNoteKey);
          if (keys.length > 0) {
            var nk = keys[0];
            result.noteTitle = getStr(firstNoteKey, nk + '.title');
            result.noteDesc = (getStr(firstNoteKey, nk + '.desc') || '').slice(0, 500);
            result.noteId = getStr(firstNoteKey, nk + '.noteId') || getStr(firstNoteKey, nk + '.id');
            result.userId = getStr(firstNoteKey, nk + '.user.userId') || getStr(firstNoteKey, nk + '.userId') || getStr(firstNoteKey, nk + '.user_id');
            result.authorName = getStr(firstNoteKey, nk + '.user.nickname') || getStr(firstNoteKey, nk + '.user.name');
            result.images = [];
            var imgList = get(firstNoteKey, nk + '.imageList') || get(firstNoteKey, nk + '.images');
            if (Array.isArray(imgList)) {
              for (var i = 0; i < imgList.length && i < 30; i++) {
                var u = (typeof imgList[i] === 'string') ? imgList[i] : getStr(imgList[i], 'url') || getStr(imgList[i], 'infoList.0.url');
                if (u) result.images.push(u);
              }
            }
            result.likeCount = getNum(firstNoteKey, nk + '.likedCount') || getNum(firstNoteKey, nk + '.like_count');
            result.collectCount = getNum(firstNoteKey, nk + '.collectedCount') || getNum(firstNoteKey, nk + '.collect_count');
            result.shareCount = getNum(firstNoteKey, nk + '.shareCount') || getNum(firstNoteKey, nk + '.share_count');
            result.noteTime = getNum(firstNoteKey, nk + '.time') || getNum(firstNoteKey, nk + '.createTime');
            result._hasData = true;
          }
        }

        // 用户信息
        if (!result.userId) {
          var ui = get(st, 'user.userInfo') || get(st, 'userInfo');
          if (typeof ui === 'object' && ui !== null) {
            result.userId = getStr(ui, 'userId') || getStr(ui, 'user_id');
            result.authorName = getStr(ui, 'nickname') || getStr(ui, 'nick_name');
            result.followerCount = getNum(ui, 'followerCount') || getNum(ui, 'follower_count');
            result._hasData = true;
          }
        }

        // 笔记列表（用户主页）
        if (!result.noteId) {
          var notes = get(st, 'search.notes') || get(st, 'feed.notes') || get(st, 'notes');
          if (Array.isArray(notes) && notes.length > 0) {
            result.noteId = getStr(notes[0], 'id') || getStr(notes[0], 'noteId');
            result.notes = [];
            for (var i = 0; i < notes.length && i < 30; i++) {
              result.notes.push({
                id: getStr(notes[i], 'id'),
                noteId: getStr(notes[i], 'noteId'),
                title: getStr(notes[i], 'displayTitle') || getStr(notes[i], 'title'),
                likedCount: getNum(notes[i], 'likedCount')
              });
            }
            result._hasData = true;
          }
        }

        // DOM 降级
        if (!result.noteTitle) {
          var el = document.querySelector('.note-title, .title, h1');
          if (el && el.textContent) result.noteTitle = el.textContent.trim().slice(0, 200);
        }
      } catch(e) { result._err = String(e).slice(0, 100); }
      try { return JSON.stringify(result); } catch(e) { return '{}'; }
    })()`);
    const parsed = JSON.parse(data);
    return parsed;
  } catch {
    return { _hasData: false };
  }
}
