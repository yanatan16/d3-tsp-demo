(function (d3, _) {
	'use strict';
	console.log('Started!');

	var width = 960,
	    height = 500,
	    centered,
	    dotscale = 5,
	    cities = [];

	var path = d3.geo.path();

	var svg = d3.select("#tsp").append("svg")
	    .attr("width", width)
	    .attr("height", height);

	// Arrows
	svg.append("svg:defs")
	  .append("svg:marker")
	    .attr("id", "directed-line")
	    .attr("viewBox", "0 -5 10 10")
	    .attr("refX", 15)
	    .attr("refY", -1.5)
	    .attr("markerWidth", 6)
	    .attr("markerHeight", 6)
	    .attr("orient", "auto")
	  .append("svg:path")
	    .attr("d", "M0,-5L10,0L0,5");

	svg.append("rect")
	    .attr("class", "background")
	    .attr("width", width)
	    .attr("height", height)
	    .on('click', clickMap);

	var g = svg.append("g")
	    .attr("id", "states");

	d3.json("states.json", function(json) {
	  g.selectAll("path")
	      .data(json.features)
	    .enter().append("path")
	      .attr("d", path)
	      .on('click', clickMap);
	});

	function clickMap () {
		cities.push(d3.mouse(this));
		drawCities();
	}

	function reset () {
		cities = [];
		svg.selectAll('circle').remove();
		svg.selectAll('path.connection').remove();
	}

	function drawCities() {
		svg.selectAll('circle').data(cities).enter()
			.append('circle')
				.attr('cx', function (d) { return d[0]; })
				.attr('cy', function (d) { return d[1]; })
				.attr('r', dotscale)
				.attr('class', 'city');
	}

	function drawPaths(ipath) {
		var paths = _.map(_.zip(ipath.slice(0,ipath.length-1), ipath.slice(1)), function (pair) {
			return [cities[pair[0]], cities[pair[1]]]
		}).slice();

		svg.selectAll('path.connection').remove();
		svg.selectAll('path.connection').data(paths).enter()
			.append('path')
				.attr('d', function(d) {
			    var dx = d[1][0] - d[0][0],
			        dy = d[1][1] - d[0][1],
			        dr = Math.sqrt(dx * dx + dy * dy);
			    return "M" + d[0][0] + "," + d[0][1] + "A" + dr + "," + dr + " 0 0,1 " + d[1][0] + "," + d[1][1];
			  })
				.attr('class', 'connection')
    		.attr("marker-end", "url(#directed-line)");
	}

	function run() {
		console.log('running', cities);

		var answer = sanTsp(cities, {});
		drawPaths(answer.initial.path);
		setTimeout(function () { drawPaths(answer.final.path); }, 1000);
	}


	// SAN TSP:
	// Everything below here is simulated annealling for the
	// Traveling Salesman Problem.

	function ccCost(c1, c2) {
		return Math.sqrt(Math.pow(c1[0] - c2[0], 2) + Math.pow(c1[1] - c2[1], 2));
	}
	function sum(arr) {
		return _.reduce(arr, function (x,y){ return x+y; }, 0);
	}
	function pathCost(path) {
		var zipped = _.zip(path.slice(0,path.length-1), path.slice(1));
		return sum(_.map(zipped, function (pair) {
			return ccCost(cities[pair[0]], cities[pair[1]]);
		}));
	}
	function randomPath() {
		var n = cities.length
			,	path = [0] // wlog, begin with 0
			, rest = _.range(1, n);

		while (rest.length > 0) {
			var i = Math.floor(Math.random() * rest.length);
			path.push(rest[i]);
			rest.splice(i, 1);
		}
		return path.concat([0]);
	}
	function inversion(path, a, b) {
		return path.slice(0, a)
			.concat(path.slice(a, b).reverse())
			.concat(path.slice(b));
	}
	function translation(path, a, b) {
		return path.slice(0, a)
			.concat(path.slice(b, b+1))
			.concat(path.slice(a, b))
			.concat(path.slice(b+1));
	}
	function switching(path, a, b) {
		return path.slice(0, a)
			.concat(path.slice(b-1, b))
			.concat(path.slice(a+1, b-1))
			.concat(path.slice(a, a+1))
			.concat(path.slice(b));
	}

	var ops = [
		[.75, inversion],
		[.125, translation],
		[.125, switching]
	];

	function createNewPath(path) {
		var roll = Math.random(),
				a = Math.floor(Math.random()*(path.length - 4)+1),
				b = Math.floor(Math.random()*(path.length - 4)) + 3,
				op = null;
		_.each(ops, function (pair) {
			if (roll < pair[0]) {
				op = pair[1];
				roll = 1000;
			} else {
				roll -= pair[0];
			}
		});

		return op(path, a, b);
	}
	function metropolis(c1, c2, T) {
		return Math.random() <= Math.exp((c1 - c2) / T);
	}
	function doRound(cur, T) {
		var newpath = createNewPath(cur.path),
				newcost = pathCost(newpath);

		if ((newcost < cur.cost) || metropolis(newcost, cur.cost)) {
			return {
				path: newpath,
				cost: newcost
			};
		} else {
			return cur;
		}
	}
	function anneal(T, lambda) {
		return T * lambda;
	}
	function san(opts) {
		var T = opts.T,
			path = randomPath(),
			cur = {
				path: path,
				cost: pathCost(path)
			},
			answer = {
				initial: cur
			},
			i;

		if (opts.onRound) opts.onRound(cur.path);
		console.log('Starting SAN-TPS', cur);

		for (i = 1; i < opts.N; i++) {
			cur = doRound(cur, T);

			if (i % opts.round) {
				T = anneal(T, opts.lambda);
				if (ops.onRound) {
					opts.onRound(cur.path);
				}
				console.log('Iteration ' + i, cur);
			}
		}
		console.log('Finished SAN-TPS', cur);
		answer.final = cur;
		return answer;
	}

	function sanTsp(cities, opts) {
		opts = opts || {};
		opts.N = opts.N || 10000; // Max Loss measurements
		opts.T = opts.T || 70;
		opts.lambda = opts.lambda || 0.95;
		opts.round = opts.round || 100;

		return san(opts);
	}

	// Bind Buttons
	d3.select('#run').on('click', run);
	d3.select('#reset').on('click', reset);

	console.log('Loaded!');
})(d3, _);