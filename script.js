// 独自言語をC++に変換する関数（トランスパイラ）
function transpileToCpp(customCode) {
    let cpp = customCode;

    // 1. 先に関数系・マクロ系の置換（カッコを伴うもの）
    
    // 入力 I(a, b) -> cin >> a >> b;
    cpp = cpp.replace(/I\((.*?)\);/g, function(match, p1) {
        let args = p1.split(',').map(arg => arg.trim()).join(' >> ');
        return `std::cin >> ${args};`;
    });

    // 出力 O(a, b) -> cout << a << b;
    cpp = cpp.replace(/O\((.*?)\);/g, function(match, p1) {
        let args = p1.split(',').map(arg => arg.trim()).join(' << ');
        return `std::cout << ${args};`;
    });

    // ループ系マクロ
    cpp = cpp.replace(/\bFP\(([^,]+),\s*([^,]+),\s*([^)]+)\)/g, "for(long long int $1 = $2; $1 < $3; $1++)");
    cpp = cpp.replace(/\bFM\(([^,]+),\s*([^,]+),\s*([^)]+)\)/g, "for(long long int $1 = $2; $1 > $3; $1--)");
    cpp = cpp.replace(/\bF\s*\(/g, "for(");

    // 配列の初期化 = [1, 2, 3] -> = {1, 2, 3}
    cpp = cpp.replace(/=\s*\[(.*?)\]/g, "= {$1}");

    // 2. 基本的な型やキーワードの置換（\b で正確に単語単位で置換）
    cpp = cpp.replace(/\bM\s*\{/g, 'int main(){');

    cpp = cpp.replace(/\bI\b/g, 'long long int');
    cpp = cpp.replace(/\bS\b/g, 'string');
    cpp = cpp.replace(/\bB\b/g, 'bool');
    cpp = cpp.replace(/\bV\b/g, 'vector');
    cpp = cpp.replace(/\bD\b/g, 'long double');
    cpp = cpp.replace(/\bP\b/g, 'pair');
    cpp = cpp.replace(/\bT\b/g, 'tuple');
    cpp = cpp.replace(/\bC\b/g, 'char');
    cpp = cpp.replace(/\bM\b/g, 'map');
    cpp = cpp.replace(/\bF\b/g, 'void'); 
    cpp = cpp.replace(/\bR\b/g, 'return');
    cpp = cpp.replace(/\bIF\b/g, 'if');
    cpp = cpp.replace(/\bW\b/g, 'while');

    // 3. 【重要】変数未初期化によるbad_allocを防ぐ安全対策
    // 「long long int 変数名;」を「long long int 変数名 = 0;」に自動初期化する
    // これにより、もし入力が空でも n = 0 になり、メモリ爆発(bad_alloc)を防げます。
    cpp = cpp.replace(/long long int\s+([a-zA-Z0-9_]+);/g, "long long int $1 = 0;");

    // 4. C++の必須ヘッダー
    const header = `#include <iostream>\n#include <string>\n#include <vector>\nusing namespace std;\n\n`;
    
    return header + cpp;
}

// Wandbox APIを使ってコードを実行する関数
async function runCode() {
    const outputArea = document.getElementById('output');
    outputArea.innerText = "実行中...";

    // 入力されたコードを取得
    const customCode = document.getElementById('sourceCode').value;
    
    // C++に変換
    const cppCode = transpileToCpp(customCode);
    
    // Wandbox APIに送るデータを作成
    const requestData = {
        code: cppCode,
        compiler: "gcc-head", // 最新のGCCコンパイラを使用
        stdin: document.getElementById('stdin').value, // 👈 これが入っているかチェック！
        save: false
    };

    try {
        // Wandboxの無料APIにリクエストを送信
        const response = await fetch('https://wandbox.org/api/compile.json', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });

        const result = await response.json();

        // 実行結果（またはエラー）を画面に表示
        if (result.program_output) {
            outputArea.innerText = result.program_output;
        } else if (result.compiler_error) {
            outputArea.innerText = "[コンパイルエラー]\n" + result.compiler_error;
        } else if (result.program_error) {
            outputArea.innerText = "[実行時エラー]\n" + result.program_error;
        } else {
            outputArea.innerText = "正常に終了しました（出力なし）";
        }
    } catch (error) {
        outputArea.innerText = "通信エラーが発生しました: " + error.message;
    }
}
// --- エディタ補助機能（Tabのスペース化、カッコの自動補完、オートインデントなど） ---
document.addEventListener('DOMContentLoaded', () => {
    const editor = document.getElementById('sourceCode');

    editor.addEventListener('keydown', function(e) {
        const start = this.selectionStart;
        const end = this.selectionEnd;
        const value = this.value;

        // 【追加】1. Backspaceキーの処理（カッコのペア削除 ＆ Tab一括削除）
        if (e.key === 'Backspace' && start === end && start > 0) {
            const charBefore = value.substring(start - 1, start);
            const charAfter = value.substring(start, start + 1);
            const pairs = { '(': ')', '{': '}', '[': ']', '"': '"', "'": "'" };

            // カッコやクォーテーションのペアを同時に消す
            if (pairs[charBefore] && pairs[charBefore] === charAfter) {
                e.preventDefault();
                this.value = value.substring(0, start - 1) + value.substring(start + 1);
                this.selectionStart = this.selectionEnd = start - 1;
                return;
            }

            // スペース2個（Tab）を一気に消す
            if (start >= 2 && value.substring(start - 2, start) === "  ") {
                e.preventDefault();
                this.value = value.substring(0, start - 2) + value.substring(start);
                this.selectionStart = this.selectionEnd = start - 2;
                return;
            }
        }

        // 【追加】2. Enterキーの処理（オートインデント ＆ {}のスマート改行）
        if (e.key === 'Enter') {
            e.preventDefault();
            
            // 現在の行の開始位置を探し、インデント（先頭の連続するスペース）を取得する
            let lineStart = value.lastIndexOf('\n', start - 1);
            lineStart = lineStart === -1 ? 0 : lineStart + 1;
            const currentLine = value.substring(lineStart, start);
            const indentMatch = currentLine.match(/^\s*/);
            const currentIndent = indentMatch ? indentMatch[0] : "";

            const charBefore = value.substring(start - 1, start);
            const charAfter = value.substring(start, start + 1);

            if (charBefore === '{') {
                // { と } の間でEnterを押した場合（VSCodeなどと同じ挙動）
                if (charAfter === '}') {
                    const newIndent = currentIndent + "  "; // Tab1個分追加
                    this.value = value.substring(0, start) + "\n" + newIndent + "\n" + currentIndent + value.substring(start);
                    this.selectionStart = this.selectionEnd = start + 1 + newIndent.length;
                } else {
                    // { の後でEnterを押した場合（単純にインデントを1段深くする）
                    const newIndent = currentIndent + "  ";
                    this.value = value.substring(0, start) + "\n" + newIndent + value.substring(start);
                    this.selectionStart = this.selectionEnd = start + 1 + newIndent.length;
                }
            } else {
                // 通常の改行（前の行のインデントをそのまま引き継ぐ）
                this.value = value.substring(0, start) + "\n" + currentIndent + value.substring(start);
                this.selectionStart = this.selectionEnd = start + 1 + currentIndent.length;
            }
            return;
        }

        // 3. Tabキーを押したときの処理（2文字のスペースを挿入）
        if (e.key === 'Tab') {
            e.preventDefault();
            this.value = value.substring(0, start) + "  " + value.substring(end);
            this.selectionStart = this.selectionEnd = start + 2;
            return;
        }

        // 4. カッコやクォーテーションの自動補完
        const pairs = { '(': ')', '{': '}', '[': ']', '"': '"', "'": "'" };
        if (pairs[e.key]) {
            e.preventDefault();
            const char = e.key;
            const closingChar = pairs[char];

            if (start !== end) {
                // 選択範囲がある場合は両端を囲む
                const selectedText = value.substring(start, end);
                this.value = value.substring(0, start) + char + selectedText + closingChar + value.substring(end);
                this.selectionStart = start;
                this.selectionEnd = end + 2;
            } else {
                // 通常の自動補完
                this.value = value.substring(0, start) + char + closingChar + value.substring(end);
                this.selectionStart = this.selectionEnd = start + 1;
            }
        }
    });
});
// --- フィルター回避用：完全ローカル認証＆コード保存システム ---

let currentUser = null;

// 1. 新規登録（ブラウザのLocalStorageにユーザー情報を記録）
function localSignUp() {
    const user = document.getElementById('username').value.trim();
    const pass = document.getElementById('password').value;

    if (!user || !pass) { alert("ユーザー名とパスワードを入力してください"); return; }

    let users = JSON.parse(localStorage.getItem('ide_users') || '{}');

    if (users[user]) {
        alert("そのユーザー名はすでに登録されています");
        return;
    }

    // パスワードを登録（簡易的に保存。外部に送信されません）
    users[user] = { password: pass };
    localStorage.setItem('ide_users', JSON.stringify(users));
    alert("登録が完了しました！そのままログインしてください。");
}

// 2. ログイン（ページ遷移せず、画面の表示だけを切り替える）
function localSignIn() {
    const user = document.getElementById('username').value.trim();
    const pass = document.getElementById('password').value;

    let users = JSON.parse(localStorage.getItem('ide_users') || '{}');

    if (users[user] && users[user].password === pass) {
        currentUser = user;
        showLoggedInUI();
        loadLocalCodes();
    } else {
        alert("ユーザー名またはパスワードが違います");
    }
}

// ログイン成功時の画面切り替え
function showLoggedInUI() {
    document.getElementById('authSection').style.display = 'none';
    document.getElementById('saveSection').style.display = 'block';
    document.getElementById('userDisplay').innerText = currentUser;
}

// 3. ログアウト
function localLogout() {
    currentUser = null;
    document.getElementById('authSection').style.display = 'block';
    document.getElementById('saveSection').style.display = 'none';
    document.getElementById('username').value = "";
    document.getElementById('password').value = "";
}

// 4. コードをローカルに保存（ユーザーごとに区別）
function saveCodeLocal() {
    if (!currentUser) return;

    const title = document.getElementById('codeTitle').value.trim() || "無題のコード";
    const code = document.getElementById('sourceCode').value;
    const stdin = document.getElementById('stdin').value;

    let allCodes = JSON.parse(localStorage.getItem('ide_saved_codes') || '[]');

    // 新しいコードデータを追加
    allCodes.push({
        user: currentUser,
        title: title,
        code: code,
        stdin: stdin,
        date: new Date().toLocaleString()
    });

    localStorage.setItem('ide_saved_codes', JSON.stringify(allCodes));
    alert("コードをこのパソコン内に保存しました！");
    document.getElementById('codeTitle').value = "";
    loadLocalCodes();
}

// 5. 保存したコード一覧を読み込んで表示（【修正】削除ボタンを追加）
function loadLocalCodes() {
    if (!currentUser) return;

    const listElement = document.getElementById('savedCodesList');
    listElement.innerHTML = "";

    let allCodes = JSON.parse(localStorage.getItem('ide_saved_codes') || '[]');
    
    // ログイン中のユーザーのデータだけをフィルター（元の配列内での本当のインデックスも一緒に保持する）
    let myCodes = allCodes
        .map((item, originalIndex) => ({ ...item, originalIndex }))
        .filter(item => item.user === currentUser);

    if (myCodes.length === 0) {
        listElement.innerHTML = `<li style="color: #666; font-size: 13px;">保存されたコードはありません。</li>`;
        return;
    }

    myCodes.forEach((item) => {
        const li = document.createElement('li');
        li.style.margin = "8px 0";
        li.style.display = "flex";
        li.style.justifyContent = "between";
        li.style.alignItems = "center";
        li.style.maxWidth = "400px";
        
        li.innerHTML = `
            <div style="flex-grow: 1;">
                <a href="#" onclick="loadSelectedCode(${item.originalIndex}); return false;" style="color: #007bff; text-decoration: none; font-weight: bold;">
                    ${item.title}
                </a> 
                <br>
                <span style="font-size: 11px; color: #666;">(${item.date})</span>
            </div>
            <button onclick="deleteCodeLocal(${item.originalIndex}, '${item.title}')" style="background: #dc3545; color: white; border: none; padding: 3px 8px; font-size: 12px; border-radius: 3px; cursor: pointer; margin-left: 10px;">
                削除
            </button>
        `;
        listElement.appendChild(li);
    });
}

// 6. 一覧から選んだコードをエディタに復元する（【修正】引数を一意のインデックスに変更）
function loadSelectedCode(originalIndex) {
    let allCodes = JSON.parse(localStorage.getItem('ide_saved_codes') || '[]');
    const target = allCodes[originalIndex];

    if (target && target.user === currentUser) {
        document.getElementById('sourceCode').value = target.code;
        document.getElementById('stdin').value = target.stdin;
        alert(`「${target.title}」を読み込みました！`);
    }
}

// 【追加】7. 指定したコードをLocalStorageから削除する関数
function deleteCodeLocal(originalIndex, title) {
    // 学校のPCで誤クリックしても大丈夫なように確認を挟む
    if (!confirm(`「${title}」を本当に削除してもよろしいですか？\n※この操作は取り消せません。`)) {
        return;
    }

    let allCodes = JSON.parse(localStorage.getItem('ide_saved_codes') || '[]');
    
    // 安全チェック: 削除しようとしているコードが本当に自分のものか確認
    if (allCodes[originalIndex] && allCodes[originalIndex].user === currentUser) {
        // 指定した位置のデータを1件削除
        allCodes.splice(originalIndex, 1);
        
        // データベース（LocalStorage）を更新
        localStorage.setItem('ide_saved_codes', JSON.stringify(allCodes));
        
        // 画面の一覧をリフレッシュ
        loadLocalCodes();
    }
}
