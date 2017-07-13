
var roomMgr = require('./roommgr');
var userMgr = require('./usermgr');
var mjutils = require('./mjutils');
var wcutils = require('./wildcard');
var wzmj = require('./wzmj');
var db = require('../utils/db');
var crypto = require("../utils/crypto");

var games = {};
var gamesIdBase = 0;

var ACTION_CHUPAI = 1;
var ACTION_MOPAI = 2;
var ACTION_PENG = 3;
var ACTION_GANG = 4;
var ACTION_CHI = 5;
var ACTION_HU = 6;
var ACTION_ZIMO = 7;
var ACTION_MING = 8;

var HOLDS_NUM = 13;
var gameSeatsOfUsers = {};

var MJ_TYPE_WAN = 1;
var MJ_TYPE_TIAO = 2;
var MJ_TYPE_TONG = 3;
var MJ_TYPE_FENG = 4;

var allMJs = [  11, 12, 13, 14, 15, 16, 17, 18, 19, 
		21, 22, 23, 24, 25, 26, 27, 28, 29,
		31, 32, 33, 34, 35, 36, 37, 38, 39 ];

var allMJs_2P = [ 11, 12, 13, 14, 15, 16, 17, 18, 19,
		  41, 42, 43, 44, 45, 46, 47 ];

function getAllMJs(nSeats) {
	if (4 == nSeats) {
		return allMJs;
	} else {
		return allMJs_2P;
	}
}

function getMJNum(nSeats) {
	var totals = [ 64, 108 ];

	if (4 == nSeats) {
		return totals[1];
	} else {
		return totals[0];
	}
}

function getMJType(pai) {
	return parseInt(pai / 10);
}

function getMJVal(pai) {
	return pai % 10;
}

function shuffle(game) {
	var mahjongs = game.mahjongs;
	var nSeats = game.numOfSeats;

	// 万: 11 - 19
	var count = 0;
	for (var i = 11; i < 20; i++) {
		for (var c = 0; c < 4; c++) {
			mahjongs[count] = i;
			count++;
		}
	}

	if (4 == nSeats) {
		// 条: 21 - 29
		for (var i = 21; i < 30; i++) {
			for (var c = 0; c < 4; c++) {
				mahjongs[count] = i;
				count++;
			}
		}

		// 筒: 31 - 39
		for (var i = 31; i < 40; i++) {
			for (var c = 0; c < 4; c++) {
				mahjongs[count] = i;
				count++;
			}
		}
	} else {
		// 东南西北中发白: 41 - 47
		for (var i = 41; i < 48; i++) {
			for (var c = 0; c < 4; c++) {
				mahjongs[count] = i;
				count++;
			}
		}
	}

	for (var i = 0; i < count; i++) {
		var lastIndex = mahjongs.length - 1 - i;
		var index = Math.floor(Math.random() * lastIndex);
		var t = mahjongs[index];
		mahjongs[index] = mahjongs[lastIndex];
		mahjongs[lastIndex] = t;
	}
}

function dice(game) {
	var dices = game.dices;

	dices.push((Math.floor(Math.random() * 100) % 6) + 1);
	dices.push((Math.floor(Math.random() * 1000) % 6) + 1);
}

function mopai(game, seatIndex) {
	if (game.currentIndex == game.mahjongs.length) {
		return -1;
	}

	var seat = game.gameSeats[seatIndex];
	var mahjongs = seat.holds;
	var pai = game.mahjongs[game.currentIndex];

	mahjongs.push(pai);

	var c = seat.countMap[pai];
	if (c == null) {
		c = 0;
	}

	seat.countMap[pai] = c + 1;
	game.currentIndex ++;

	return pai;
}

function deal(game, cb) {
	var seatIndex = game.button;
	var numOfSeats = game.numOfSeats;

	game.currentIndex = 0;

	for (var i = 0; i < (numOfSeats * HOLDS_NUM); i++) {
		mopai(game, seatIndex);
		seatIndex = (seatIndex + 1) % numOfSeats;
	}

	mopai(game, game.button);
	game.turn = game.button;

	var actions = [];
	var seats = game.roomInfo.seats;
	var nums = [ 0, 0, 0, 0 ];

	var execute = function() {
		if (actions.length == 0) {
			if (cb) {
				cb();
			}

			return;
		}

		var act = actions[0];
		var si = act.seatIndex;
		var s = seats[si];
		var uid = s.userId;

		nums[si] = act.holds.length;

		userMgr.sendMsg(uid, 'game_holds_update_push', act.holds);
		userMgr.broacastInRoom('game_holds_len_push', { seatIndex: si, len: act.holds.length }, uid, false);

		var numOfMJ = game.mahjongs.length;
		for (var i = 0; i < nums.length; i++) {
			numOfMJ -= nums[i];
		}

		userMgr.broacastInRoom('mj_count_push', numOfMJ, uid, true);

		actions.splice(0, 1);

		setTimeout(execute, act.to);
	};

	seatIndex = game.button;

	for (var j = 0; j  < (HOLDS_NUM / 4 - 1); j++) {
		for (var i = 0; i < numOfSeats; i++) {
			var holds = game.gameSeats[seatIndex].holds;
			var act = {
				seatIndex: seatIndex,
				holds: holds.slice(0, (j + 1) * 4),
				to: 300,
			};

			actions.push(act);

			seatIndex = (seatIndex + 1) % numOfSeats;
		}
	}

	seatIndex = game.button;
	for (var i = 0; i < numOfSeats; i++) {
		var holds = game.gameSeats[seatIndex].holds;
		var act = {
			seatIndex: seatIndex,
			holds: holds.slice(0),
			to: 200,
		};

		actions.push(act);

		seatIndex = (seatIndex + 1) % numOfSeats;
	}

	execute();
}

function checkCanPeng(game, seatData, pai) {
	var count = seatData.countMap[pai];
	if (count != null && count >= 2) {
		seatData.canPeng = true;
	}
}

function checkCanChi(game, seatData, pai) {
	return;
}

function checkCanDianGang(game, seatData, pai) {
	if (game.mahjongs.length <= game.currentIndex) {
		return;
	}

	var count = seatData.countMap[pai];
	if (count != null && count >= 3) {
		seatData.canGang = true;
		seatData.gangPai.push(pai);
	}
}

function checkCanAnGang(game, seatData) {
	if (game.mahjongs.length <= game.currentIndex) {
		return;
	}

	for (var key in seatData.countMap) {
		var pai = parseInt(key);
		var c = seatData.countMap[key];
		if (c != null && c == 4) {
			seatData.canGang = true;
			seatData.gangPai.push(pai);
		}
	}
}

function checkCanWanGang(game, seatData) {
	if (game.mahjongs.length <= game.currentIndex) {
		return;
	}

	for (var i = 0; i < seatData.pengs.length; ++i) {
		var pai = seatData.pengs[i];
		if (seatData.countMap[pai] == 1) {
			seatData.canGang = true;
			seatData.gangPai.push(pai);
		}
	}
}

function checkCanHu(game, seatData, pai) {
	game.lastHuPaiSeat = -1;

	if (game.conf.zimo && game.chuPai != -1) {
		return;
	}

	var tings = seatData.tings;

	if (tings.indexOf(pai) == -1) {
		return;
	}

	seatData.canHu = true;
}

function clearOptions(game, sd) {
	var options = sd.options;

	var fnClear = function(sd) {
		sd.canPeng = false;
		sd.canGang = false;
		sd.canChi = false;
		sd.gangPai = [];
		sd.canHu = false;
		sd.canMingPai = false;
		sd.mingPai = [];
		sd.lastFangGangSeat = -1;

		sd.options = [];
	}

	if (options.length == 0) {
		fnClear(sd);
		return;
	}

	for (var i = 0; i < options.length; i++) {
		var op = options[i];

		if (op == ACTION_HU) {
			sd.canHu = false;
		} else if (op == ACTION_PENG) {
			sd.canPeng = false;
		} else if (op == ACTION_GANG) {
			sd.canGang = false;
			sd.gangPai = [];
		} else if (op == ACTION_CHI) {
			sd.canChi = false;
		} else if (op == ACTION_MING) {
			sd.canMingPai = false;
			sd.mingPai = [];
		}
	}

	sd.options = [];
}

function clearAllOptions(game, seatData) {
	var fnClear = function(sd) {
		sd.canPeng = false;
		sd.canGang = false;
		sd.canChi = false;
		sd.gangPai = [];
		sd.canHu = false;
		sd.canMingPai = false;
		sd.mingPai = [];
		sd.lastFangGangSeat = -1;

		sd.options = [];
	}

	if (seatData) {
		fnClear(seatData);
	} else {
		game.qiangGangContext = null;
		game.options = [];
		for (var i = 0; i < game.numOfSeats; i++) {
			var sd = game.gameSeats[i];
			fnClear(sd);
		}
	}
}

function checkCanTingPai(game, seatData) {
	var tings = seatData.tings = [];
	var holds = seatData.holds;

	var fnAddTings = function(arr) {
		for (var i = 0; i < arr.length; i++) {
			var t = arr[i];
			if (tings.indexOf(t) == -1) {
				tings.push(t);
			}
		}
	};

	if (seatData.holds.length >= HOLDS_NUM) {
		fnAddTings(wzmj.getAPTings(seatData, 1, getAllMJs(game.numOfSeats)));
	}

	var pingHus = wcutils.getTings(holds, 1);

	fnAddTings(pingHus);
}

function checkCanMingPai(game, sd) {
	var holds = sd.holds;
	var tingOuts = wcutils.getTingOuts(holds, 1);

	var fnAdd = function(arr) {
		for (var i = 0; i < arr.length; i++) {
			var t = arr[i];
			if (tingOuts.indexOf(t) == -1) {
				tingOuts.push(t);
			}
		}
	};

	fnAdd(wzmj.getAPTingOuts(sd, 1));

	sd.canMingPai = tingOuts.length > 0;
	sd.mingPai = tingOuts;
}

function getSeatIndex(userId) {
	var seatIndex = roomMgr.getUserSeatId(userId);
	if (seatIndex == null) {
		return null;
	}

	return seatIndex;
}

function getGameByUserID(userId) {
	var roomId = roomMgr.getUserRoom(userId);
	if (roomId == null) {
		return null;
	}

	var game = games[roomId];
	return game;
}

function hasOperations(seatData) {
	return (seatData.canGang || seatData.canPeng || seatData.canHu);
}

function sendOptions(game, sd, pai) {
	var ops = sd.options;

	if (ops == null || ops.length == 0) {
		userMgr.sendMsg(sd.userId, 'game_action_push');
		return;
	}

	var si = sd.seatIndex;

	var data = {
		pai: pai,
		si: si,
	};

	if (pai == -1) {
		data.pai = sd.holds[sd.holds.length - 1];
	}

	for (var i = 0; i < ops.length; i++) {
		var op = ops[i];

		if (op == ACTION_HU) {
			data.hu = true;
		} else if (op == ACTION_PENG) {
			data.peng = true;
		} else if (op == ACTION_GANG) {
			data.gang = true;
			data.gangpai = sd.gangPai;
		}
	}

	userMgr.sendMsg(sd.userId, 'game_action_push', data);
}

function sendOperations(game, seatData, pai) {
	if (hasOperations(seatData)) {
		if (pai == -1) {
			pai = seatData.holds[seatData.holds.length - 1];
		}

		var data = {
			pai: pai,
			hu: seatData.canHu,
			peng: seatData.canPeng,
			gang: seatData.canGang,
			gangpai: seatData.gangPai,
			si: seatData.seatIndex,
		};

		userMgr.sendMsg(seatData.userId, 'game_action_push', data);
	} else {
		userMgr.sendMsg(seatData.userId, 'game_action_push');
	}

	var autoAction = function() {
		var uid = seatData.userId;
		if (seatData.canHu) {
			exports.hu(uid);
		} else if (seatData.canGang) {
			exports.gang(uid, seatData.gangPai[0]);
		} else if (seatData.canChuPai) {
			var chupai = seatData.holds[seatData.holds.length - 1];
			exports.chuPai(uid, chupai);
		}
	};

	if (seatData.hasMingPai) {
		setTimeout(autoAction, 1000);
	}
}

function moveToNextUser(game, nextSeat) {
	game.fangpaoshumu = 0;

	if (nextSeat == null) {
		game.turn ++;
		game.turn %= game.numOfSeats;
		return;
	} else {
		game.turn = nextSeat;
	}
}

function doUserMoPai(game) {
	game.chuPai = -1;

	var turn = game.turn;
	var seat = game.gameSeats[turn];
	var uid = seat.userId;

	seat.lastFangGangSeat = -1;

	var pai = mopai(game, turn);
	if (pai == -1) {
		doGameOver(game, seat.userId);
		return;
	}

	var numOfMJ = game.mahjongs.length - game.currentIndex;
	userMgr.broacastInRoom('mj_count_push', numOfMJ, uid, true);

	recordGameAction(game, turn, ACTION_MOPAI, pai);

	var info = {
		pai: pai,
		userId: uid,
	};

	if (seat.hasMingPai) {
		userMgr.broacastInRoom('game_mopai_push', info, uid, true);
	} else {
		userMgr.sendMsg(uid, 'game_mopai_push', info);
		info.pai = -1;
		userMgr.broacastInRoom('game_mopai_push', info, uid, false);
	}

	checkCanAnGang(game, seat);

	checkCanWanGang(game, seat);

	checkCanHu(game, seat, pai);

	checkCanMingPai(game, seat);

	seat.canChuPai = true;
	userMgr.broacastInRoom('game_chupai_push', uid, uid, true);

	sendOperations(game, seat, game.chuPai);
}

function getBirds(game) {
	var si = -1;

	if (game.yipaoduoxiang >= 0) {
		si = game.yipaoduoxiang;
	}
	else if (game.firstHupai >= 0) {
		si = game.firstHupai;
	}

	if (si < 0) {
		console.log('seat error');
		return 0;
	}

	var birdNum = game.conf.birds;

	var mjs = game.mahjongs;
	var index = game.currentIndex;
	var left = mjs.length - index - 1;
	var min = birdNum <= left ? birdNum : left;
	var seat = game.gameSeats[si];

	if (min == 0) {
		return 0;
	}

	var birds = [];
	var score = 0;

	for (var i = 0; i < min; i++) {
		var pai = mjs[index + i];

		birds.push(pai);

		if (pai < 40 && pai > 10) {
			var val = getMJVal(pai);
			if (val % 4 == 1) {
				score += 1;
			}
		}
	}

	seat.birds = { score: score, mjs: birds };

	return score;
}

function calculateResult(game, roomInfo) {
	var baseScore = game.baseScore;
	var numOfHued = 0;
	var conf = game.conf;
	var type = conf.type;
	var nSeats = game.numOfSeats;
	var birdsScore = 0;

	if (game.firstHupai >= 0) {
		birdsScore = getBirds(game);
	}

	for (var i = 0; i < nSeats; i++) {
		var sd = game.gameSeats[i];
		var detail = sd.detail;
		var hu = sd.hu;
		var holds = sd.holds;
		var countMap = sd.countMap;
		var stat = sd.stat;
		var tips = sd.tips = [];

		for (var a = 0; a < sd.actions.length; ++a) {
			var ac = sd.actions[a];
			if (ac.type == "fanggang") {

			} else if (ac.type == "angang" || ac.type == "wangang" || ac.type == "diangang") {
				var acscore = ac.score;
				var gang = ac.targets.length * acscore;

				detail.gang += gang;

				for (var t = 0; t < ac.targets.length; ++t) {
					var six = ac.targets[t];
					var gs = game.gameSeats[six];

					gs.detail.gang -= acscore;
				}
			}
		}

		for (var j = 0; j < sd.huInfo.length; ++j) {
			var info = sd.huInfo[j];
			var is8pairs = false;

			hu.action = info.action;
			hu.hued = info.ishupai;

			if (!info.ishupai) {
				hu.fangpao = true;
				sd.numDianPao++;
				continue;
			}

			numOfHued += 1;

			var pai = info.pai;
			var tings = sd.tings;
			var iszimo = info.iszimo;
			var fan = 1;

			hu.pai = pai;
			
			if (iszimo) {
				tips.push('自摸');
				fan = 2;
			} else if (info.action == 'qiangganghu') {
				tips.push('抢杠胡');
			} else {
				tips.push('平胡');
			}

			var score = baseScore * fan;

			if (iszimo) {
				for (var t = 0; t < nSeats; t++) {
					if (t == i) {
						continue;
					}

					var gs = game.gameSeats[t];

					gs.detail.score -= score;
					sd.detail.score += score;
					gs.detail.bs -= birdsScore;
					sd.detail.bs += birdsScore;
				}

				sd.numZiMo++;
			} else {
				var gs = game.gameSeats[info.target];

				gs.detail.score -= score;
				sd.detail.score += score;
				gs.detail.bs -= birdsScore;
				sd.detail.bs += birdsScore;

				sd.numJiePao++;
			}
		}

		hu.numDianPao = sd.numDianPao;
	}

	for (var i = 0; i < nSeats; i++) {
		var sd = game.gameSeats[i];
		var tips = sd.tips;
		var detail = sd.detail;
		var gang = detail.gang;
		var bs = detail.bs;

		sd.score += detail.score;
		sd.score += gang;
		sd.score += bs;

		if (detail.score > 0) {
			tips.push('胡分: ' + detail.score);
		} else if (detail.score < 0) {
			tips.push('被胡分: ' + detail.score);
		}

		tips.push('杠算分: ' + gang);
		tips.push('抓鸟分: ' + bs);

		if (tips.length > 0) {
			detail.tips = tips.join('    ');
		}

		console.log('seat ' + i + ' score: ' + sd.score);
	}
}

function getRoomInfo(uid) {
	var roomId = roomMgr.getUserRoom(uid);
	if (roomId == null) {
		return null;
	}

	return roomMgr.getRoom(roomId);
}

function doGameOver(game, userId, forceEnd) {
	var roomId = roomMgr.getUserRoom(userId);
	if (roomId == null) {
		return null;
	}

	var roomInfo = roomMgr.getRoom(roomId);
	if (roomInfo == null) {
		return;
	}

	var results = [];
	var dbresult = [ 0, 0, 0, 0 ];
	var info = {};

	if (forceEnd) {
		info.dissolve = true;
	}

	var fnNoticeResult = function(isEnd) {
		var endinfo = null;
		if (isEnd) {
			endinfo = [];
			for (var i = 0; i < roomInfo.seats.length; ++i) {
				var rs = roomInfo.seats[i];
				endinfo.push({
					numzimo: rs.numZiMo,
					numjiepao: rs.numJiePao,
					numdianpao: rs.numDianPao,
					numangang: rs.numAnGang,
					numminggang: rs.numMingGang,
				});
			}

			info.end = true;
		}

		var fnGameOver = function() {
			userMgr.broacastInRoom('game_over_push', { results: results, endinfo: endinfo, info: info }, userId, true);

			if (isEnd) {
				roomInfo.end = true;

				setTimeout(function() {
					if (roomInfo.numOfGames > 1) {
						store_history(roomInfo);    
					}

					userMgr.kickAllInRoom(roomId);
					roomMgr.destroy(roomId);
					db.archive_games(roomInfo.uuid);            
				}, 1500);
			}
		}

		fnGameOver();
	}

	if (game != null) {
		calculateResult(game, roomInfo);

		if (game.firstHupai < 0) {
			info.huangzhuang = true;
		}

		for (var i = 0; i < roomInfo.seats.length; ++i) {
			var rs = roomInfo.seats[i];
			var sd = game.gameSeats[i];
			
			rs.ready = false;
			rs.score += sd.score
			rs.numZiMo += sd.numZiMo;
			rs.numJiePao += sd.numJiePao;
			rs.numDianPao += sd.numDianPao;
			rs.numAnGang += sd.numAnGang;
			rs.numMingGang += sd.numMingGang;

			var userRT = {
				userId:sd.userId,
				actions:[],
				pengs:sd.pengs,
				wangangs:sd.wangangs,
				diangangs:sd.diangangs,
				angangs:sd.angangs,
				holds: sd.holds,
				score: sd.score,
				totalscore:rs.score,
				huinfo:sd.huInfo,
				detail: sd.detail,
				hu: sd.hu,
				button: game.button == i,
			};

			if (sd.birds) {
				userRT.birds = sd.birds;
			}

			for (var k in sd.actions) {
				userRT.actions[k] = {
					type: sd.actions[k].type,
				};

				if (sd.actions[k].fan) {
					userRT.actions[k].fan = sd.actions[k].fan;
				}
			}

			results.push(userRT);

			dbresult[i] = sd.score;
			delete gameSeatsOfUsers[sd.userId];
		}

		delete games[roomId];

		var nSeats = game.numOfSeats;
		var old = roomInfo.nextButton;

		if (game.yipaoduoxiang >= 0) {
			roomInfo.nextButton = game.yipaoduoxiang;
		}
		else if (game.firstHupai >= 0) {
			roomInfo.nextButton = game.firstHupai;
		} else {
			// 荒庄不下庄
		}

		if (old != roomInfo.nextButton) {
			db.update_next_button(roomId, roomInfo.nextButton);
		}
	}
    
	if (forceEnd || game == null) {
		fnNoticeResult(true);
	} else {
		//保存游戏
		store_game(game, function(ret) {
			db.update_game_result(roomInfo.uuid, game.gameIndex, dbresult);

			//记录玩家操作
			var str = JSON.stringify(game.actionList);
			db.update_game_action_records(roomInfo.uuid, game.gameIndex, str); 

			//保存游戏局数
			db.update_num_of_turns(roomId, roomInfo.numOfGames);

			//如果是第一次，则扣除房卡  TODO: 测试阶段不扣房卡
			if (false && roomInfo.numOfGames == 1) {
				var cost = 1;
				if (roomInfo.conf.maxGames == 16) {
					cost = 2;
				}

				db.cost_gems(game.gameSeats[0].userId, cost);
			}

			var isEnd = (roomInfo.numOfGames >= roomInfo.conf.maxGames);

/*
			if (isEnd) {
				for (var i = 0; i < game.gameSeats.length; ++i) {
					var sd = game.gameSeats[i];
					var uid = sd.userId;

					db.bind_done(uid);
				}
			}
*/
			fnNoticeResult(isEnd);
		});
	}
}

function recordUserAction(game, seatData, type, target) {
	var d = { type: type, targets: [] };
	if (target != null) {
		if (typeof(target) == 'number') {
			d.targets.push(target);    
		} else {
			d.targets = target;
		}
	} else {
		for(var i = 0; i < game.gameSeats.length; ++i){
			var s = game.gameSeats[i];

			if (i != seatData.seatIndex) {
				d.targets.push(i);
			}
		}
	}

	seatData.actions.push(d);

	return d;
}

function recordGameAction(game, si, action, pai){
	game.actionList.push(si);
	game.actionList.push(action);

	if (pai != null) {
		game.actionList.push(pai);
	}
}

exports.setReady = function(userId, callback) {
	var roomId = roomMgr.getUserRoom(userId);
	if (roomId == null) {
		return;
	}

	var roomInfo = roomMgr.getRoom(roomId);
	if (roomInfo == null) {
		return;
	}

	roomMgr.setReady(userId, true);

	var game = games[roomId];
	if (game == null) {
		if (roomInfo.seats.length == roomInfo.numOfSeats) {
			for(var i = 0; i < roomInfo.seats.length; ++i){
				var s = roomInfo.seats[i];
				if (!s.ready || !userMgr.isOnline(s.userId)) {
					return;
				}
			}

			exports.begin(roomId);
		}
	} else {
		var numOfMJ = game.mahjongs.length - game.currentIndex;
		var remainingGames = roomInfo.conf.maxGames - roomInfo.numOfGames;
		
		var data = {
			state: game.state,
			numofmj: numOfMJ,
			numOfSeats: game.numOfSeats,
			button: game.button,
			turn: game.turn,
			chuPai: game.chuPai,
		};

		data.seats = [];
		var seatData = null;
		for (var i = 0; i < game.numOfSeats; ++i) {
			var sd = game.gameSeats[i];

			var s = {
				userid: sd.userId,
				folds: sd.folds,
				angangs: sd.angangs,
				diangangs: sd.diangangs,
				wangangs: sd.wangangs,
				pengs: sd.pengs,
				hued: sd.hued,
				huinfo: sd.huInfo,
				iszimo: sd.iszimo,
				tings: sd.tings,
			};

			if (sd.userId == userId) {
				s.holds = sd.holds;
				seatData = sd;
			}

			data.seats.push(s);
		}

		//同步整个信息给客户端
		userMgr.sendMsg(userId, 'game_sync_push', data);

		if (game.turn == seatData.seatIndex) {
			sendOperations(game, seatData, game.chuPai);
		} else {
			var ops = seatData.options;

			if (ops != null && ops.length > 0) {
				sendOptions(game, seatData, game.chuPai);
			}
		}
	}
}

function store_single_history(userId, history) {
    db.get_user_history(userId, function(data) {
        if (data == null) {
            data = [];
        }

        while (data.length >= 10) {
            data.shift();
        }

        data.push(history);
        db.update_user_history(userId, data);
    });
}

function store_history(roomInfo) {
    var seats = roomInfo.seats;
    var history = {
        uuid:roomInfo.uuid,
        id:roomInfo.id,
        time:roomInfo.createTime,
        seats:new Array(roomInfo.numOfSeats)
    };

    for (var i = 0; i < seats.length; ++i) {
        var rs = seats[i];
        var hs = history.seats[i] = {};
        hs.userid = rs.userId;
        hs.name = crypto.toBase64(rs.name);
        hs.score = rs.score;
    }

    for (var i = 0; i < seats.length; ++i) {
        var s = seats[i];
        store_single_history(s.userId,history);
    }
}

function construct_game_base_info(game) {
	var numOfSeats = game.numOfSeats;
	var baseInfo = {
		type:game.conf.type,
		button:game.button,
		index:game.gameIndex,
		mahjongs:game.mahjongs,
		game_seats:new Array(numOfSeats),
		conf: game.conf,
	}

	for(var i = 0; i < numOfSeats; ++i) {
	    baseInfo.game_seats[i] = game.gameSeats[i].holds;
	}

	game.baseInfoJson = JSON.stringify(baseInfo);
}

function store_game(game,callback){
    db.create_game(game.roomInfo.uuid, game.gameIndex, game.baseInfoJson, callback);
}

exports.begin = function(roomId) {
	var roomInfo = roomMgr.getRoom(roomId);
	if (roomInfo == null) {
	    return;
	}

	var seats = roomInfo.seats;
	var numOfSeats = roomInfo.numOfSeats;

	var game = {
		conf: roomInfo.conf,
		roomInfo: roomInfo,
		gameIndex: roomInfo.numOfGames,

		button: roomInfo.nextButton,
		mahjongs: new Array(getMJNum(numOfSeats)),
		currentIndex: 0,
		numOfSeats: numOfSeats,
		gameSeats: new Array(numOfSeats),

		turn: 0,
		chuPai: -1,
		state: "idle",
		firstHupai: -1,
		fangpaoshumu: -1,
		actionList: [],
		chupaiCnt: 0,

		baseScore: roomInfo.conf.baseScore,

		dices: [],
		options: [],
	};

	roomInfo.numOfGames++;
	
	for (var i = 0; i < numOfSeats; ++i) {
		var data = game.gameSeats[i] = {};

		data.game = game;

		data.seatIndex = i;

		data.userId = seats[i].userId;
		//持有的牌
		data.holds = [];
		//打出的牌
		data.folds = [];
		//暗杠的牌
		data.angangs = [];
		//点杠的牌
		data.diangangs = [];
		//弯杠的牌
		data.wangangs = [];
		//碰了的牌
		data.pengs = [];

		//玩家手上的牌的数目，用于快速判定碰杠
		data.countMap = {};
		//玩家听牌，用于快速判定胡了的番数
		data.tingMap = {};
		data.pattern = "";

		//是否可以杠
		data.canGang = false;
		//用于记录玩家可以杠的牌
		data.gangPai = [];

		//是否可以碰
		data.canPeng = false;
		//是否可以胡
		data.canHu = false;
		//是否可以出牌
		data.canChuPai = false;

		//是否胡了
		data.hued = false;

		data.actions = [];

		//是否是自摸
		data.iszimo = false;
		data.isGangHu = false;
		data.fan = 0;
		data.score = 0;
		data.huInfo = [];

		data.lastFangGangSeat = -1;

		//统计信息
		data.numZiMo = 0;
		data.numJiePao = 0;
		data.numDianPao = 0;
		data.numAnGang = 0;
		data.numMingGang = 0;

		data.stat = {};

		data.conf = {};

		data.tings = [];
		data.hasMingPai = false;
		data.mingPai = [];

		data.hu = {};
		data.detail = {
			tips: null,
			gang: 0,
			fan: 0,
			score: 0,
			bs: 0,
		};

		gameSeatsOfUsers[data.userId] = data;
	}

	games[roomId] = game;

	shuffle(game);

	dice(game);

	for (var i = 0; i < seats.length; ++i) {
		var s = seats[i];

		userMgr.sendMsg(s.userId, 'game_num_push', roomInfo.numOfGames);
		userMgr.sendMsg(s.userId, 'game_begin_push', game.button);
	}

	var notify = function() {
		var numOfMJ = game.mahjongs.length - game.currentIndex;

		for (var i = 0; i < seats.length; ++i) {
			var s = seats[i];

			userMgr.sendMsg(s.userId, 'game_holds_updated_push');
		}

		construct_game_base_info(game);

		var turnSeat = game.gameSeats[game.turn];
		userMgr.broacastInRoom('game_playing_push', null, turnSeat.userId, true);

		for (var i = 0; i < game.gameSeats.length; ++i) {
			var duoyu = -1;
			var gs = game.gameSeats[i];
			if (gs.holds.length == HOLDS_NUM + 1) {
				duoyu = gs.holds.pop();
				gs.countMap[duoyu] -= 1;
			}

			checkCanTingPai(game, gs);

			if (duoyu >= 0) {
				gs.holds.push(duoyu);
				gs.countMap[duoyu] ++;
			}
		}

		game.state = "playing";

		turnSeat.canChuPai = true;
		userMgr.broacastInRoom('game_chupai_push', turnSeat.userId, turnSeat.userId, true);

		checkCanAnGang(game, turnSeat);
		checkCanHu(game,turnSeat,turnSeat.holds[turnSeat.holds.length - 1]);
		checkCanMingPai(game, turnSeat);

		sendOperations(game, turnSeat, game.chuPai);
	};

	var turnSeat = game.gameSeats[game.turn];
	userMgr.broacastInRoom('game_dice_push', game.dices, turnSeat.userId, true);

	setTimeout(function() {
		deal(game, notify);
	}, 1000);
};

exports.chuPai = function(userId, pai) {
	pai = Number.parseInt(pai);
	var seatData = gameSeatsOfUsers[userId];
	if (seatData == null) {
		console.log("can't find user game data.");
		return;
	}

	var game = seatData.game;
	var nSeats = game.numOfSeats;
	var seatIndex = seatData.seatIndex;
	if(game.turn != seatData.seatIndex){
		console.log("not your turn.");
		return;
	}

	if (!seatData.canChuPai) {
		console.log('no need chupai.');
		return;
	}

	if (hasOperations(seatData)) {
		console.log('plz guo before you chupai.');
		return;
	}

	var index = seatData.holds.indexOf(pai);
	if (index == -1) {
		console.log("can't find mj." + pai);
		return;
	}

	seatData.canChuPai = false;
	game.chupaiCnt ++;

	seatData.holds.splice(index, 1);
	seatData.countMap[pai] --;
	game.chuPai = pai;
	recordGameAction(game, seatData.seatIndex, ACTION_CHUPAI, pai);
	checkCanTingPai(game, seatData);
	userMgr.broacastInRoom('game_chupai_notify_push', { userId: seatData.userId, pai: pai }, seatData.userId, true);

	var hasActions = false;
	var opts = [ [], [] ];

	for (var i = 1; i < nSeats; i++) {
		var si = (game.turn + i) % nSeats;
		var gs = game.gameSeats[si];

		checkCanHu(game, gs, pai);
		if (gs.canHu) {
			opts[0].push({ si: si, act: ACTION_HU });
		}

		checkCanPeng(game, gs, pai);
		checkCanDianGang(game, gs, pai);
		if (gs.canPeng) {
			opts[1].push({ si: si, act: ACTION_PENG });
		}

		if (gs.canGang) {
			opts[1].push({ si: si, act: ACTION_GANG });
		}
	}

	var options = game.options = [];
	for (var i = 0; i < opts.length; i++) {
		var opt = opts[i];

		for (var j = 0; j < opt.length; j++) {
			var op = opt[j];
			options.push(op);
		}
	}

	if (options.length > 0) {
		var op = options[0];
		var si = op.si;
		var sd = game.gameSeats[si];
		var ops = [ op.act ];

		for (var i = 1; i < options.length; i++) {
			var opt = options[i];

			if (opt.si == si) {
				ops.push(opt.act);
			} else {
				break;
			}
		}

		sd.options = ops;
		sendOptions(game, sd, game.chuPai);
		options.splice(0, ops.length);

		hasActions = true;
	}

	if (!hasActions) {
		setTimeout(function() {
			userMgr.broacastInRoom('guo_notify_push', { userId: seatData.userId, pai: game.chuPai }, seatData.userId, true);
			seatData.folds.push(game.chuPai);
			game.chuPai = -1;
			moveToNextUser(game);
			doUserMoPai(game);         
		}, 500);
	}
};

function checkOption(sd, action) {
	var ops = sd.options;
	if (ops == null || ops.length == 0 || ops.indexOf(action) == -1) {
		return false;
	}

	return true;
}

exports.peng = function(userId) {
	var seatData = gameSeatsOfUsers[userId];
	if (seatData == null) {
		console.log("can't find user game data.");
		return;
	}

	var game = seatData.game;

	if (game.turn == seatData.seatIndex) {
		console.log("it's your turn.");
		return;
	}

	if (!checkOption(seatData, ACTION_PENG)) {
		console.log('you have not options');
		return;
	}

	if (!seatData.canPeng) {
		console.log("seatData.peng == false");
		return;
	}

	clearAllOptions(game);

	//验证手上的牌的数目
	var pai = game.chuPai;
	var c = seatData.countMap[pai];
	if (c == null || c < 2) {
		console.log("lack of mj.");
		return;
	}

	//从此人牌中扣除
	for (var i = 0; i < 2; ++i) {
		var index = seatData.holds.indexOf(pai);
		if (index == -1) {
			console.log("can't find mj.");
			return;
		}

		seatData.holds.splice(index, 1);
		seatData.countMap[pai] --;
	}

	seatData.pengs.push(pai);
	game.chuPai = -1;

	recordGameAction(game, seatData.seatIndex, ACTION_PENG, pai);

	//广播通知其它玩家
	userMgr.broacastInRoom('peng_notify_push', { userid: seatData.userId, pai: pai }, seatData.userId, true);

	//碰的玩家打牌
	moveToNextUser(game, seatData.seatIndex);

	checkCanAnGang(game, seatData);
	checkCanWanGang(game, seatData);
	checkCanMingPai(game, seatData);

	//广播通知玩家出牌方
	seatData.canChuPai = true;
	userMgr.broacastInRoom('game_chupai_push', seatData.userId, seatData.userId, true);

	//通知玩家做对应操作
	sendOperations(game, seatData, game.chuPai);
};

exports.isPlaying = function(userId) {
	var seatData = gameSeatsOfUsers[userId];
	if (seatData == null) {
	    return false;
	}

	var game = seatData.game;

	if (game.state == "idle") {
		return false;
	}

	return true;
}

function checkCanQiangGang(game, turnSeat, seatData, pai) {
	var hasActions = false;
	var nSeats = game.numOfSeats;
	var options = game.options = [];

	for (var i = 1; i < nSeats; i++) {
		var si = (seatData.seatIndex + i) % nSeats;
		var gs = game.gameSeats[si];

		checkCanHu(game, gs, pai);
		if (gs.canHu) {
			options.push({ si: si, act: ACTION_HU });

			hasActions = true;
		}
	}

	if (hasActions) {
		game.qiangGangContext = {
			turnSeat: turnSeat,
			seatData: seatData,
			pai: pai,
			isValid: true,
		};
	} else {
	    game.qiangGangContext = null;
	}

	if (options.length > 0) {
		var op = options[0];
		var gs = game.gameSeats[op.si];

		gs.options.push(op.act);
		options.splice(0, 1);
		sendOptions(game, gs, pai);
	}

	return game.qiangGangContext != null;
}

function doGang(game, turnSeat, seatData, gangtype, numOfCnt, pai) {
	var seatIndex = seatData.seatIndex;
	var gameTurn = turnSeat.seatIndex;

	if (gangtype == "wangang") {
		var idx = seatData.pengs.indexOf(pai);
		if (idx >= 0) {
			seatData.pengs.splice(idx,1);
		}
	}

	for (var i = 0; i < numOfCnt; ++i) {
		var index = seatData.holds.indexOf(pai);
		if (index == -1) {
			console.log("can't find mj.");
			return;
		}

		seatData.holds.splice(index, 1);
		seatData.countMap[pai] --;
	}

	recordGameAction(game, seatData.seatIndex, ACTION_GANG, pai);

	var baseScore = game.baseScore;
	var ac = null;
	var stat = seatData.stat;

	if (gangtype == "angang") {
		seatData.angangs.push(pai);
		ac = recordUserAction(game, seatData, "angang");
		ac.score = baseScore * 2;

		seatData.numAnGang += 1;
	} else if(gangtype == "diangang") {
		seatData.diangangs.push(pai);
		ac = recordUserAction(game, seatData, "diangang", gameTurn);
		ac.score = baseScore * 2;

		var fs = turnSeat;
		recordUserAction(game, fs, "fanggang", seatIndex);


		seatData.numMingGang += 1;
	} else if (gangtype == "wangang") {
		seatData.wangangs.push(pai);
		ac = recordUserAction(game, seatData, "wangang");
		ac.score = baseScore;

		seatData.numMingGang += 1;
	}

	checkCanTingPai(game, seatData);

	userMgr.broacastInRoom('gang_notify_push', { userid: seatData.userId, pai: pai, gangtype: gangtype }, seatData.userId, true);

	moveToNextUser(game, seatIndex);

	doUserMoPai(game);

	//只能放在这里。因为过手就会清除杠牌标记
	seatData.lastFangGangSeat = gameTurn;
}

exports.ming = function(uid, data) {
	// 转转麻将不能明牌
};

exports.gang = function(userId, pai) {
	var seatData = gameSeatsOfUsers[userId];
	if (seatData == null) {
		console.log("can't find user game data.");
		return;
	}

	var seatIndex = seatData.seatIndex;
	var game = seatData.game;

	if (game.turn != seatIndex && !checkOption(seatData, ACTION_GANG))
	{
		console.log('you have not options');
		return;
	}

	if (!seatData.canGang) {
		console.log("seatData.gang == false");
		return;
	}

	var numOfCnt = seatData.countMap[pai];

	if (seatData.gangPai.indexOf(pai) == -1) {
		console.log("the given pai can't be ganged.");
		return;
	}

	var gangtype = '';
	if (numOfCnt == 1) {
		gangtype = "wangang"
	} else if (numOfCnt == 3) {
		gangtype = "diangang"
	} else if (numOfCnt == 4) {
		gangtype = "angang";
	} else {
		console.log("invalid pai count.");
		return;
	}

	game.chuPai = -1;
	clearAllOptions(game);
	seatData.canChuPai = false;

	userMgr.broacastInRoom('hangang_notify_push', seatIndex, seatData.userId, true);

	//如果是弯杠，则需要检查是否可以抢杠
	var turnSeat = game.gameSeats[game.turn];
	if (numOfCnt == 1) {
		var canQiangGang = checkCanQiangGang(game, turnSeat, seatData, pai);
		if (canQiangGang) {
			return;
		}
	}

	doGang(game, turnSeat, seatData, gangtype, numOfCnt, pai);
};

exports.hu = function(userId) {
	var seatData = gameSeatsOfUsers[userId];
	if (seatData == null) {
	    console.log("can't find user game data.");
	    return;
	}

	var seatIndex = seatData.seatIndex;
	var game = seatData.game;

	if (!seatData.canHu) {
		console.log("invalid request.");
		return;
	}

	seatData.hued = true;

	var hupai = game.chuPai;
	var isZimo = false;
	var turnSeat = game.gameSeats[game.turn];

	var huData = {
		ishupai: true,
		pai: -1,
		action: null,
		isGangHu: false,
		isQiangGangHu: false,
		iszimo: false,
		target: -1,
		fan: 0,
		pattern: null,
	};

	seatData.huInfo.push(huData);

	huData.isGangHu = turnSeat.lastFangGangSeat >= 0;
	var notify = -1;

	if (game.qiangGangContext != null) {
		hupai = game.qiangGangContext.pai;
		var gangSeat = game.qiangGangContext.seatData;
		notify = hupai;
		huData.iszimo = false;
		huData.action = "qiangganghu";
		huData.isQiangGangHu = true;
		huData.target = gangSeat.seatIndex;
		huData.pai = hupai;

		recordGameAction(game, seatIndex, ACTION_HU, hupai);
		game.qiangGangContext.isValid = false;

		gangSeat.huInfo.push({
		    action: "beiqianggang",
		    target: seatData.seatIndex,
		    index: seatData.huInfo.length-1,
		});
	} else if (game.chuPai == -1) {
		hupai = seatData.holds.pop();
		seatData.countMap[hupai] --;
		notify = hupai;
		huData.pai = hupai;
		if (huData.isGangHu) {
			huData.action = "ganghua";
			huData.iszimo = true;
		} else {
			huData.action = "zimo";
			huData.iszimo = true;
		}

		isZimo = true;
		recordGameAction(game, seatIndex, ACTION_ZIMO, hupai);
	} else {
		notify = game.chuPai;
		huData.pai = hupai;

		var at = "hu";
		//炮胡
		if (turnSeat.lastFangGangSeat >= 0) {
		    	at = "gangpaohu";
		}

		huData.action = at;
		huData.iszimo = false;
		huData.target = game.turn;

		//记录玩家放炮信息
		var fs = game.gameSeats[game.turn];
		if (at == "gangpaohu") {
			at = "gangpao";
		} else {
			at = "fangpao";
		}

		fs.huInfo.push({
			action: at,
			target: seatData.seatIndex,
			index: seatData.huInfo.length-1,
		});
		
		recordGameAction(game, seatIndex, ACTION_HU, hupai);

		game.fangpaoshumu++;

		if (game.fangpaoshumu > 1) {
		    game.yipaoduoxiang = game.turn;
		}
	}

	if (game.firstHupai < 0) {
		game.firstHupai = seatIndex;
	}

	huData.iszimo = isZimo;

	huData.isHaiDiHu = game.currentIndex == game.mahjongs.length;
	if (game.chupaiCnt == 0 && game.button == seatData.seatIndex && game.chuPai == -1) {
		huData.isTianHu = true;
	} else if (game.chupaiCnt == 1 && game.turn == game.button && game.button != seatData.seatIndex && game.chuPai != -1) {
		huData.isDiHu = true;
	}

	clearAllOptions(game, seatData);

	//通知前端，有人和牌了
	var data = {
		seatindex: seatIndex,
		iszimo: isZimo,
		hupai: notify,
		holds: seatData.holds,
	};

	userMgr.broacastInRoom('hu_push', data, seatData.userId, true);
	
	if (game.lastHuPaiSeat == -1) {
		game.lastHuPaiSeat = seatIndex;
	}

	//清空所有非胡牌操作
	var options = game.options;
	var hasAction = false;

	for (var i = 0; i < game.gameSeats.length; ++i) {
		var gs = game.gameSeats[i];

		gs.canPeng = false;
		gs.canGang = false;
		gs.canChuPai = false;
	}

	if (options.length > 0) {
		var op = options[0];
		var si = op.si;
		var sd = game.gameSeats[si];
		var ops = [ op.act ];

		if (op.act == ACTION_HU) {
			sd.options = ops;
			sendOptions(game, sd, game.chuPai);
			options.splice(0, ops.length);
			hasAction = true;
		}

		for (var i = 0; i < options.length;) {
			var opt = options[i];

			if (opt.act != ACTION_HU) {
				options.splice(i, 1);
			} else {
				i++;
			}
		}
	}

	//如果还有人可以胡牌，则等待
	if (hasAction) {
		return;
	}

	doGameOver(game, userId);
};

exports.guo = function(userId) {
	var seatData = gameSeatsOfUsers[userId];
	if (seatData == null){
		console.log("can't find user game data.");
		return;
	}

	var seatIndex = seatData.seatIndex;
	var game = seatData.game;

	if (!hasOperations(seatData)) {
		console.log("no need guo.");
		return;
	}

	//如果是玩家自己的轮子，不是接牌，则不需要额外操作
	var doNothing = game.chuPai == -1 && game.turn == seatIndex;

	userMgr.sendMsg(seatData.userId, "guo_result");
	clearOptions(game, seatData);

	if (doNothing) {
		return;
	}

	var options = game.options;
	if (options.length > 0) {
		var op = options[0];
		var si = op.si;
		var sd = game.gameSeats[si];
		var ops = [ op.act ];

		for (var i = 1; i < options.length; i++) {
			var opt = options[i];

			if (opt.si == si) {
				ops.push(opt.act);
			} else {
				break;
			}
		}

		sd.options = ops;
		sendOptions(game, sd, game.chuPai);
		options.splice(0, ops.length);

		return;
	}

	if (game.firstHupai >= 0) {
		doGameOver(game, userId);
		return;
	}

	//如果是已打出的牌，则需要通知
	if (game.chuPai >= 0) {
		var uid = game.gameSeats[game.turn].userId;
		userMgr.broacastInRoom('guo_notify_push', { userId: uid, pai: game.chuPai }, seatData.userId, true);

		var gs = game.gameSeats[game.turn];
		gs.folds.push(game.chuPai);
		game.chuPai = -1;
	}

	var qiangGangContext = game.qiangGangContext;
	//清除所有的操作
	clearAllOptions(game);
	
	if(qiangGangContext != null && qiangGangContext.isValid){
		doGang(game, qiangGangContext.turnSeat, qiangGangContext.seatData, "wangang", 1, qiangGangContext.pai);        
	} else {
		//下家摸牌
		moveToNextUser(game);
		doUserMoPai(game);   
	}
};

exports.hasBegan = function(roomId) {
	var game = games[roomId];
	if (game != null) {
		return true;
	}

	var roomInfo = roomMgr.getRoom(roomId);
	if (roomInfo != null) {
		return roomInfo.numOfGames > 0;
	}

	return false;
};

var dissolvingList = [];

exports.doDissolve = function(roomId) {
	var roomInfo = roomMgr.getRoom(roomId);
	if (roomInfo == null) {
		return null;
	}

	var game = games[roomId];
	doGameOver(game, roomInfo.seats[0].userId, true);
};

exports.dissolveUpdate = function(roomId, userId, online) {
	var roomInfo = roomMgr.getRoom(roomId);
	if (roomInfo == null) {
		return null;
	}

	var seatIndex = roomMgr.getUserSeatId(userId);
	if (seatIndex == null) {
		return null;
	}

	var dr = roomInfo.dr;

	if (dr == null) {
		if (!online) {
			return exports.dissolveRequest(roomId, userId, true);
		} else {
			return null;
		}
	}

	dr.online[seatIndex] = online;

	var found = false;
	var reject = -1;
	for (var i = 0; i < dr.online.length; i++) {
		if (!dr.online[i]) {
			found = true;
		}

		if (dr.states[i] == 1) {
			reject = roomInfo.seats[i].userId;
		}
	}

	if (!found) {
		if (dr.reason == 'offline' || reject >= 0) {
			if (reject >= 0) {
				roomInfo.rejectUser = reject;
			}

			roomInfo.dr = null;
			var idx = dissolvingList.indexOf(roomId);
			if (idx != -1) {
			    	dissolvingList.splice(idx, 1);           
			}
		}
	}

	return roomInfo;
};

exports.dissolveRequest = function(roomId, userId, offline) {
	var roomInfo = roomMgr.getRoom(roomId);
	if (roomInfo == null) {
		return null;
	}

	var seatIndex = roomMgr.getUserSeatId(userId);
	if (seatIndex == null) {
		return null;
	}

	var nSeats = roomInfo.numOfSeats;
	var dr = roomInfo.dr;

	if (dr != null) {
		if (dr.reason == 'offline' && !offline) {
			dr.endTime = Date.now() + 600000;
			dr.reason = 'request';
			dr.states[seatIndex] = 3;
		} else {
			return null;
		}
	} else {
		dr = {
			endTime: Date.now() + 600000,
			states:  new Array(nSeats),
			online: new Array(nSeats),
		};

		for (var i = 0; i < nSeats; i++) {
			dr.states[i] = 0;
			dr.online[i] = true;
		}

		if (offline) {
			dr.reason = 'offline';
			dr.online[seatIndex] = false;
		} else {
			dr.reason = 'request';
			dr.states[seatIndex] = 3;
		}

		roomInfo.dr = dr;
		dissolvingList.push(roomId);
	}

	return roomInfo;
};

exports.dissolveAgree = function(roomId, userId, agree) {
	var roomInfo = roomMgr.getRoom(roomId);
	if (roomInfo == null) {
		return null;
	}

	var dr = roomInfo.dr;
	if (dr == null) {
		return null;
	}

	var seatIndex = roomMgr.getUserSeatId(userId);
	if (seatIndex == null) {
		return null;
	}

	if (agree) {
		dr.states[seatIndex] = 2;
		var count = 0;
		for (var i = 0; i < dr.states.length; i++) {
			if (dr.states[i] >= 2) {
				count++;
			}
		}

		if (2 == count) {
			dr.endTime = Date.now() + 300000;
		}
	} else {
		dr.states[seatIndex] = 1;

		var found = false;
		for (var i = 0; i < dr.online.length; i++) {
			if (!dr.online[i]) {
				found = true;
				break;
			}
		}

		if (!found) {
			roomInfo.dr = null;
			var idx = dissolvingList.indexOf(roomId);
			if (idx != -1) {
			    	dissolvingList.splice(idx, 1);           
			}
		}
	}

	return roomInfo;
};

function update() {
	for (var i = dissolvingList.length - 1; i >= 0; --i) {
		var roomId = dissolvingList[i];

		var roomInfo = roomMgr.getRoom(roomId);
		if (roomInfo != null && roomInfo.dr != null) {
			if (Date.now() > roomInfo.dr.endTime) {
				console.log("delete room and games");
				exports.doDissolve(roomId);
				dissolvingList.splice(i,1);
			}
		} else {
			dissolvingList.splice(i,1);
		}
	}
}

setInterval(update, 1000);

exports.parseConf = function (roomConf, conf) {
	var type = roomConf.type;
	var hu = roomConf.hu;
	var zimo = false;

	if (hu && hu > 0) {
		zimo = true;
	}

	conf.zimo = zimo;
	conf.birds = roomConf.birds || 0;
}

exports.checkConf = function() {
	return true;
};

exports.initRoomSeat = function(seat) {

};


