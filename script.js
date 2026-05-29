// 独自言語をC++に変換する関数（トランスパイラ）
function transpileToCpp(customCode) {
    let cpp = customCode;

    // 1. 関数系の置換（I() と O() を先に処理する）
    // 【修正】入力 I(a, b) -> cin >> a >> b;
    // ※「(」が付いているものを優先して置換することで、型の I と自動で区別されます。
    cpp = cpp.replace(/I\((.*?)\);/g, function(match, p1) {
        let args = p1.split(',').map(arg => arg.trim()).join(' >> ');
        return `std::cin >> ${args};`;
    });

    // 出力 O(a, b) -> cout << a << b;
    cpp = cpp.replace(/O\((.*?)\);/g, function(match, p1) {
        let args = p1.split(',').map(arg => arg.trim()).join(' << ');
        return `std::cout << ${args};`;
    });
    // 【追加】配列の初期化 = [1, 2, 3] を = {1, 2, 3} に変換する
    // ※ v[1] のような要素アクセスと区別するため、= の後ろにある場合のみ変換します
    cpp = cpp.replace(/=\s*\[(.*?)\]/g, "= {$1}");

    // 2. 基本的な型やキーワードの置換
    cpp = cpp.replaceAll('M{', 'int main(){');
    // ↑の I() の置換から漏れた（＝(が付いていない）I だけが long long int になります
    cpp = cpp.replaceAll('I ', 'long long int '); 
    cpp = cpp.replaceAll('S ', 'string ');
    cpp = cpp.replaceAll('B ', 'bool ');
    cpp = cpp.replaceAll('V ', 'vector ');
    cpp = cpp.replaceAll('R ', 'return ');
    cpp = cpp.replaceAll('IF', 'if');
    cpp = cpp.replaceAll('W ', 'while ');

    // 3. C++の必須ヘッダー
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
