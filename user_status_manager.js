// =====================================================
// 1. 初期設定
// =====================================================

// Discordの参加者要素をまとめて取得
// ※DOMが差し替わることがあるので、あとで再取得する前提で使う
let users = document.querySelectorAll('[data-userid]');

// 状態保存用のキー
const STORAGE_KEY = "player_status_map";

// 二度押し全リセットの状態
let allResetPending = false;

// DOM差し替え監視の多重起動防止
let discordDomObserver = null;
let reinitScheduled = false;

// メニュー項目
const dataSet = [
	{
		type:    "color",
		name:    "◯白",
		state:   "white",
		bgcolor: "",
		img:     "",
		text:    "白",
	},
	{
		type:    "color",
		name:    "●黒",
		state:   "black",
		bgcolor: "",
		img:     "",
		text:    "黒",
	},
	{
		type:    "color",
		name:    "パンダ",
		state:   "panda",
		bgcolor: "",
		img:     "",
		text:    "",
	},
	{
		type:    "co",
		name:    "占いCO",
		state:   "uranai",
		bgcolor: "rgba(111, 193, 199, 1)",
		// bgcolor: "",
		img:     "",
		text:    "占い師",
		// text:    "🔮",
	},
	{
		type:    "co",
		name:    "霊能CO",
		state:   "reinou",
		bgcolor: "rgba(33, 80, 150, 1)",
		// bgcolor: "",
		img:     "",
		text:    "霊能者",
		// text:    "👻",
	},
	{
		type:    "co",
		name:    "狩人CO",
		state:   "knight",
		bgcolor: "rgba(49,142,18,1)",
		// bgcolor: "",
		img:     "",
		text:    "狩人",
		// text:    "🛡️",
	},
	{
		type:    "co",
		name:    "共有CO",
		state:   "free",
		bgcolor: "rgba(49,142,18,1)",
		// bgcolor: "",
		img:     "",
		text:    "共有者",
		// text:    "👥",
	},
	{
		type:    "co",
		name:    "猫又CO",
		state:   "cat",
		bgcolor: "rgba(49,142,18,1)",
		// bgcolor: "",
		img:     "",
		text:    "猫又",
		// text:    "🐈",
	},
	{
		type:    "co",
		name:    "人狼CO",
		state:   "jinro",
		bgcolor: "rgba(158,64,64,1)",
		// bgcolor: "",
		img:     "",
		text:    "人狼",
		// text:    "🐺",
	},
	{
		type:    "co",
		name:    "狂人CO",
		state:   "mad",
		bgcolor: "rgba(241,127,33,1)",
		// bgcolor: "",
		img:     "",
		text:    "狂人",
		// text:    "🥳",
	},
	{
		type:    "co",
		name:    "妖狐CO",
		state:   "fox",
		bgcolor: "",
		img:     "",
		text:    "妖狐",
		// text:    "🦊",
	},
	{
		type:    "live",
		name:    "噛み",
		state:   "bite",
		bgcolor: "",
		img:     "",
		text:    "噛",
	},
	{
		type:    "live",
		name:    "吊り",
		state:   "execution",
		bgcolor: "",
		img:     "",
		text:    "吊",
	},
	{
		type:    "live",
		name:    "道連れ",
		state:   "takedown",
		bgcolor: "",
		img:     "",
		text:    "道連れ",
	},
	{
		type:    "gm",
		name:    "GM",
		state:   "gamemaster",
		bgcolor: "",
		img:     "",
		text:    "GM",
	},
	{
		type:    "reset",
		name:    "リセット",
		state:   "",
		bgcolor: "",
		img:     "",
		text:    "",
	},
	{
		type: "allreset",
		name: "全リセット",
		state: "",
		bgcolor: "",
		img: "",
		text: "",
	},
];


// =====================================================
// 2. 保存・読み込み
// =====================================================

// 全ユーザーの状態をまとめて保存する
// 形式は { [userId]: statusObject, ... }
function saveAllStatusMap(statusMap){
	localStorage.setItem(STORAGE_KEY, JSON.stringify(statusMap));
}

// 保存データを読み込む
function loadAllStatusMap(){
	const saved = localStorage.getItem(STORAGE_KEY);
	return saved ? JSON.parse(saved) : {};
}

// 1人分の状態を取得する
function getUserStatus(statusMap, userId){
	return statusMap[userId] || {
		id:         userId,
		coState:    "",
		liveState:  "",
		colorState: "",
		gmState: "",
	};
}

// 1人分の状態を書き換えて保存する
function updateUserStatus(statusMap, userId, patch){
	const current     = getUserStatus(statusMap, userId);
	statusMap[userId] = {
		...current,
		...patch,
	};

	saveAllStatusMap(statusMap);
}

//全てのデータを削除
function resetAllStatuses(){
	localStorage.removeItem(STORAGE_KEY);

	const currentUsers = document.querySelectorAll('[data-userid]');
	currentUsers.forEach(user => {
		// 状態表示を空にする
		user.dataset.state = "";
		user.dataset.live = "";
		user.dataset.color = "";
		user.dataset.currentGm = "";

		// 追加表示を削除
		const oldChara = user.querySelector('[data-chara]');
		if(oldChara) oldChara.remove();

		const oldColor = user.querySelector('[data-currentcolor]');
		if(oldColor) oldColor.remove();

		const oldGm = user.querySelector('[data-current-gm]');
		if(oldGm) oldGm.remove();
	});

	// 全リセットの再確認状態を解除
	allResetPending = false;

	const allResetButton = document.querySelector('li[data-allreset="true"]');
	if(allResetButton){
		allResetButton.style.backgroundColor = "";
		allResetButton.style.color = "";
		allResetButton.textContent = "全リセット";
	}

	// メニューを閉じる
	currentUsers.forEach(user => {
		user.dataset.toggleState = "";
	});

}

// =====================================================
// 3. DOM反映
// =====================================================

// 1人分の状態をDOMに反映する
// ※DOMが作り直されても、ここを通せば見た目を復元できる
function applyUserStatus(userElement, status){
	if(!userElement || !status) return;

	// 既存の表示をいったん消す
	// これをしないと、復元時にラベルが重複する
	const oldChara = userElement.querySelector('[data-chara]');
	if(oldChara) oldChara.remove();

	const oldColor = userElement.querySelector('[data-currentcolor]');
	if(oldColor) oldColor.remove();

	const oldGm = userElement.querySelector('[data-current-gm]');
	if(oldGm) oldGm.remove();

	// ---------------------------
	// CO表示の復元
	// ---------------------------
	if(status.coState){
		userElement.dataset.state = status.coState;

		const coData = dataSet.find(item => item.state === status.coState);

		const p = document.createElement("p");
		p.classList.add("character");
		p.dataset.chara = status.coState;

		// メニュー定義にある色や文言を復元
		if(coData){
			if(coData.bgcolor){
				p.setAttribute("style", `background-color:${coData.bgcolor};`);
			}
			p.innerText = coData.text || coData.name;
		} else{
			p.innerText = status.coState;
		}

		userElement.appendChild(p);
	} else{
		userElement.dataset.state = "";
	}

	// ---------------------------
	// 生死状態の復元
	// ---------------------------
	if(status.liveState){
		userElement.dataset.live = status.liveState;
	} else{
		userElement.dataset.live = "";
	}

	// ---------------------------
	// 色状態の復元
	// ---------------------------
	if(status.colorState){
		userElement.dataset.color = status.colorState;

		const p = document.createElement("p");
		p.classList.add("current-color", status.colorState);
		p.dataset.currentcolor = status.colorState;

		switch(status.colorState){
			case "white":
				p.innerText = "白";
				break;
			case "black":
				p.innerText = "黒";
				break;
			case "panda":
				p.innerHTML = "<span>白</span>黒";
				break;
		}

		userElement.appendChild(p);
	} else{
		userElement.dataset.color = "";
	}

	// ---------------------------
	// GM状態の復元
	// ---------------------------
	if(status.gmState){
		userElement.dataset.currentGm = status.gmState;

		const p = document.createElement("p");
		p.classList.add("current-gm", status.gmState);
		p.dataset.currentGm = status.gmState;
		// p.innerText = status.gmState === "GM" ? "GM" : "";
		const found = Object.values(dataSet).find(item => item.type === "gm");
		p.innerText = found.name;

		userElement.appendChild(p);
	} else{
		const oldGm = userElement.querySelector('[data-current-gm]');
		if(oldGm) oldGm.remove();
		userElement.dataset.currentGm = "";
	}
}

// 全ユーザーへ復元をかける
function applyAllStatuses(){
	const statusMap    = loadAllStatusMap();
	const currentUsers = document.querySelectorAll('[data-userid]');

	currentUsers.forEach(user => {
		const userId = user.dataset.userid;
		const status = getUserStatus(statusMap, userId);
		applyUserStatus(user, status);
	});
}

// =====================================================
// 4. メニュー生成
// =====================================================

// 1人分のメニューを作る
function createMenu(){
	const ul = document.createElement("ul");
	ul.id    = "jinro-menu";

	dataSet.forEach(item => {

		const li           = document.createElement("li");
		li.innerHTML       = item.name;
		li.dataset.type    = item.type;
		li.dataset.imgurl  = item.img || "";
		li.dataset.text    = item.text || "";
		li.dataset.bgcolor = item.bgcolor || "";

		switch(item.type){
			case "color":
				li.dataset.color = item.state;
				break;
			case "co":
				li.dataset.state = item.state;
				break;
			case "live":
				li.dataset.live = item.state;
				break;
			case "gm":
				li.dataset.gm = item.state;
				break;
			case "reset":
				li.dataset.reset = item.state;
				break;
			case "allreset":
				li.dataset.allreset = "true";
				break;
		}

		ul.appendChild(li);
	});

	return ul;
}

// 既存メニューが無ければ再作成する
function ensureMenu(user){
	if(!user) return;

	const targetSpan = user.querySelector('span');
	let menu = user.querySelector('#jinro-menu');

	if(menu) return;

	menu = createMenu();
	if(targetSpan){
		targetSpan.after(menu);
	}
}


// =====================================================
// 5. ユーザーごとの初期化
// =====================================================


// 1人のユーザーにメニューとイベントを付ける
function initUser(user, statusMap){

	if(!user) return;


	// まず保存状態を反映
	const userId      = user.dataset.userid;
	const savedStatus = getUserStatus(statusMap, userId);
	applyUserStatus(user, savedStatus);


	// メニューが消えていたら再作成する
	const targetSpan = user.querySelector('span');
	let menu = user.querySelector('#jinro-menu');
	if(!menu){
		menu = createMenu();
		if(targetSpan){
			targetSpan.after(menu);
		}
	}

	// メニューが消えていたら再作成する
	ensureMenu(user);

	// すでにイベント登録済みならここで終了
	if(user.dataset.jinroInitialized === "true") return;
	user.dataset.jinroInitialized = "true";


	// 名前クリックでメニュー開閉
	if(targetSpan){
		user.addEventListener("click", (event) => {
			const userContainer = event.target.closest('[data-userid]');
			if(!userContainer) return;

			if(userContainer.dataset.toggleState === "state-on"){
				userContainer.dataset.toggleState = "";
			} else{
				userContainer.dataset.toggleState = "state-on";
			}
		});
	}

	// メニュークリックで状態変更
	user.addEventListener("click", (event) => {
		if(!event.target.matches("li")) return;

		const clickEl       = event.target;
		const getType       = clickEl.dataset.type;
		const userContainer = event.target.closest('[data-userid]');
		if(!userContainer) return;

		const userId = userContainer.dataset.userid;

		// 現在の保存状態を取り出す
		const currentStatus = getUserStatus(statusMap, userId);

		// ここで状態を更新する
		// 保存用データはDOMではなく、このオブジェクトを正本にする
		if(getType === "co"){
			const getState = clickEl.dataset.state;


			currentStatus.coState = currentStatus.coState === getState ? "" : getState;

			// CO表示をDOMへ反映
			applyUserStatus(userContainer, currentStatus);
		}

		if(getType === "live"){
			const getLive = clickEl.dataset.live;

			// 同じ項目を再クリックしたら解除
			if(currentStatus.liveState === getLive){
				currentStatus.liveState = "";
			} else{
				currentStatus.liveState = getLive;
			}

			applyUserStatus(userContainer, currentStatus);
		}

		if(getType === "color"){
			const getColor = clickEl.dataset.color;

			currentStatus.colorState = currentStatus.colorState === getColor ? "" : getColor;
			applyUserStatus(userContainer, currentStatus);

		}

		if(getType === "gm"){
			const getGm = clickEl.dataset.gm;

			// 同じ項目を再クリックしたら解除
			if(currentStatus.gmState === getGm){
				currentStatus.gmState = "";
			} else{
				currentStatus.gmState = "gamemaster";
			}

			applyUserStatus(userContainer, currentStatus);

		}

		if(getType === "reset"){
			// リセット時は全部空にする
			currentStatus.coState    = "";
			currentStatus.liveState  = "";
			currentStatus.colorState = "";
			currentStatus.gmState = "";

			applyUserStatus(userContainer, currentStatus);
		}
		if(getType === "allreset"){
			// 1回目は確認状態にする
			if(!allResetPending){
				allResetPending = true;
				clickEl.style.backgroundColor = "#d33";
				clickEl.style.color = "#fff";
				clickEl.textContent = "全リセット（確認）";

				setTimeout(() => {
					allResetPending = false;
					clickEl.style.backgroundColor = "";
					clickEl.style.color = "";
					clickEl.textContent = "全リセット";
				}, 3000);

				return;
			}

			// 2回目で実行

			Object.keys(statusMap).forEach(key => {
				delete statusMap[key];
			});

			resetAllStatuses();
			return;
		}

		// 更新した状態を保存
		updateUserStatus(statusMap, userId, currentStatus);

		// メニューを閉じる
		userContainer.dataset.toggleState = "";
	});
}


// =====================================================
// 6. Discord側DOMの変化を監視
// =====================================================

function scheduleReinit(){
	if(reinitScheduled) return;
	reinitScheduled = true;

	requestAnimationFrame(() => {
		reinitScheduled = false;

		// 状態を再読み込みして、今あるDOMに再反映する
		boot();
	});
}

function observeDiscordDomChanges(){
	if(discordDomObserver) return;

	const targetNode = document.body;
	if(!targetNode) return;

	discordDomObserver = new MutationObserver(() => {
		scheduleReinit();
	});

	discordDomObserver.observe(targetNode, {
		childList: true,
		subtree: true,
	});
}


// =====================================================
// 7. 初期起動
// =====================================================

// 初回ロード時の処理
function boot(){
	// 保存データを読み込む
	const statusMap = loadAllStatusMap();

	// 今あるユーザーに初期化をかける
	users = document.querySelectorAll('[data-userid]');
	users.forEach(user => {
		initUser(user, statusMap);
	});

	// いちど全体復元しておく
	applyAllStatuses();

	// DOM差し替え監視を開始
	observeDiscordDomChanges();

}

// 実行
boot();
