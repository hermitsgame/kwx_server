

var HOLDS_NUM = 16;
var TOTAL_MJNUM = 136;

var allMJs = [  11, 12, 13, 14, 15, 16, 17, 18, 19, 
		21, 22, 23, 24, 25, 26, 27, 28, 29,
		31, 32, 33, 34, 35, 36, 37, 38, 39,
		41, 42, 43, 44, 45, 46, 47 ];

function getLackNum(sd) {
	var len = sd.pengs.length + sd.angangs.length + sd.wangangs.length + sd.diangangs.length;

	if (sd.chis) {
		len += sd.chis.length;
	}

	len *= 3;

	return len;
}

function getMaxPairs(sd) {
	var len = sd.holds.length;

	if (len % 3 == 1) {
		len++;
	}

	return parseInt(len / 2);
}

function getAPTings(sd, wc, all) {
	if (getLackNum(sd) > 0) {
		return [];
	}

	var danPai = [];
	var pairCount = 0;
	var cnt = sd.countMap[wc];
	var wcs = cnt != null ? cnt : 0;
	var max = getMaxPairs(sd);

	for (var k in sd.countMap) {
		var c = sd.countMap[k];
		var pai = parseInt(k);

		if (pai == wc) {
			continue;
		}

		if (c == 2 || c == 3) {
			pairCount++;
		} else if (c == 4) {
			pairCount += 2;
		}

		if (c == 1 || c == 3) {
			danPai.push(pai);
		}
	}

	var total = pairCount + wcs;

	if (total >= max) {
		return all ? all : allMJs;
	} else if (total == max - 1) {
		return danPai;
	}

	return [];
}

function getAPTingOuts(sd, wc) {
	if (getLackNum(sd) > 0) {
		return [];
	}

	var danPai = [];
	var pairCount = 0;
	var cnt = sd.countMap[wc];
	var wcs = cnt != null ? cnt : 0;
	var max = getMaxPairs(sd);

	for (var k in sd.countMap) {
		var c = sd.countMap[k];
		var pai = parseInt(k);

		if (pai == wc) {
			continue;
		}

		if (c == 2 || c == 3) {
			pairCount++;
		} else if (c == 4) {
			pairCount += 2;
		}

		if (c == 1 || c == 3) {
			danPai.push(pai);
		}
	}

	var total = pairCount + wcs;

	if (total >= max) {
		return sd.holds.slice(0);
	} else if (total == max - 1) {
		return danPai;
	}

	return [];
}

function testAPHu(sd, mj, wc) {
	if (getLackNum(sd) > 0) {
		return false;
	}

	var danPai = [];
	var pairCount = 0;
	var cnt = sd.countMap[wc];
	var wcs = cnt != null ? cnt : 0;
	var max = getMaxPairs(sd);

	var old = sd.countMap[mj];
	if (old == null) {
		sd.countMap[mj] = 0;
	}

	sd.countMap[mj]++;

	for (var k in sd.countMap) {
		var c = sd.countMap[k];
		var pai = parseInt(k);

		if (pai == wc) {
			continue;
		}

		if (c == 2 || c == 3) {
			pairCount++;
		} else if (c == 4) {
			pairCount += 2;
		}

		if (c == 1 || c == 3) {
			danPai.push(pai);
		}
	}

	sd.countMap[mj] = old;

	var total = pairCount + wcs;

	return total == max;
}

function testPengPeng(sd, mj, wc) {
	var cnt = sd.countMap[wc];
	var wcs = cnt != null ? cnt : 0;
	var need = 0;
	var chis = sd.chis;

	if (chis && chis.length > 0) {
		return false;
	}

	var old = sd.countMap[mj];
	if (old == null) {
		sd.countMap[mj] = 0;
	}

	sd.countMap[mj]++;

	for (var k in sd.countMap) {
		var c = sd.countMap[k];
		var pai = parseInt(k);

		if (pai == wc || 0 == c) {
			continue;
		}

		if (c != 3) {
			need += 3 - c % 3;
		}
	}

	sd.countMap[mj] = old;

	if (wcs + 1 >= need) {
		return true;
	}

	return false;
}

exports.getAPTings = getAPTings;
exports.getAPTingOuts = getAPTingOuts;
exports.testAPHu = testAPHu;
exports.testPengPeng = testPengPeng;

exports.allMJs = allMJs;

