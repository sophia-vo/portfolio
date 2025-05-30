import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import scrollama from 'https://cdn.jsdelivr.net/npm/scrollama@3.2.0/+esm';

// --- Global/Module-scoped variables ---
let allData;
let allCommits;

let xScale, yScale, rScale;
let svgElem;
let tooltip;

let colors; // Declare, will define after allData is loaded

// --- Data Loading and Processing ---
async function loadData() {
  return d3.csv('loc.csv', row => ({
    ...row,
    line: +row.line,
    depth: +row.depth,
    length: +row.length,
    datetime: new Date(row.datetime),
    date: new Date(row.date + 'T00:00' + row.timezone),
  }));
}

function processCommits(data) {
  const commits = d3.groups(data, d => d.commit)
    .map(([id, lines]) => {
      const first = lines[0];
      const dt = first.datetime;
      const commit = {
        id,
        url: `https://github.com/sophia-vo/portfolio/commit/${id}`,
        author: first.author,
        datetime: dt,
        hourFrac: dt.getHours() + dt.getMinutes() / 60,
        totalLines: lines.length
      };
      Object.defineProperty(commit, 'lines', {
        value: lines,
        enumerable: false,
      });
      return commit;
    });
  return commits.sort((a, b) => a.datetime - b.datetime); // Sort chronologically
}

// --- Tooltip Helper Functions ---
function showTooltip(event, d) {
  if (!tooltip) return;
  d3.select('#commit-link')
    .attr('href', d.url)
    .text(d.id.substring(0, 7) + '...');
  d3.select('#commit-date')
    .text(d.datetime.toLocaleString('en', { dateStyle: 'full', timeStyle: 'short' }));
  tooltip
    .style('left', event.clientX + 10 + 'px')
    .style('top', event.clientY + 10 + 'px')
    .attr('hidden', null);
  d3.select(event.currentTarget).attr('fill-opacity', 1).classed('hovered', true);
}

function hideTooltip(event, d) {
  if (!tooltip) return;
  tooltip.attr('hidden', '');
  if (!d3.select(event.currentTarget).classed('selected')) {
    d3.select(event.currentTarget).attr('fill-opacity', 0.7).classed('hovered', false);
  } else {
    d3.select(event.currentTarget).classed('hovered', false);
  }
}

// --- Rendering Functions ---
function renderCommitInfo(currentRawData, currentCommits) {
  const stats = d3.select('#stats').html('')
    .append('dl')
    .attr('class', 'stats');

  stats.append('dt').text('Commits Processed');
  stats.append('dd').text(currentCommits.length);

  const numFiles = currentRawData.length > 0 ? d3.groups(currentRawData, d => d.file).length : 0;
  stats.append('dt').text('Files Touched');
  stats.append('dd').text(numFiles);

  stats.append('dt').html('Total LOC');
  stats.append('dd').text(currentRawData.length);

  const maxDepth = d3.max(currentRawData, d => d.depth);
  stats.append('dt').text('Max Indent Depth');
  stats.append('dd').text(maxDepth === undefined ? 'N/A' : maxDepth);

  const longestLine = d3.max(currentRawData, d => d.length);
  stats.append('dt').text('Longest Line Length');
  stats.append('dd').text(longestLine === undefined ? 'N/A' : longestLine);

  const maxLinesInCommit = d3.max(currentCommits, d => d.totalLines);
  stats.append('dt').text('Max Lines in a Commit');
  stats.append('dd').text(maxLinesInCommit === undefined ? 'N/A' : maxLinesInCommit);
}

function renderScatterPlot(initialCommits) {
  const width = 1000, height = 600;
  const margin = { top: 10, right: 10, bottom: 30, left: 40 };

  svgElem = d3.select('#scatter-plot #chart')
    .append('svg')
    .attr('viewBox', [0, 0, width, height])
    .style('overflow', 'visible');

  xScale = d3.scaleTime()
    .domain(d3.extent(allCommits, d => d.datetime) || [new Date(), new Date()])
    .range([margin.left, width - margin.right])
    .nice();
  yScale = d3.scaleLinear()
    .domain([0, 24])
    .range([height - margin.bottom, margin.top]);

  const [minLAll, maxLAll] = d3.extent(allCommits, d => d.totalLines);
  rScale = d3.scaleSqrt()
    .domain([minLAll || 0, maxLAll || 1]) // Use allCommits for stable radius scale across updates
    .range([5, 19]);

  svgElem.append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(xScale).ticks(width / 100).tickSizeOuter(0));

  svgElem.append('g')
    .attr('class', 'y-axis')
    .attr('transform', `translate(${margin.left},0)`)
    .call(d3.axisLeft(yScale)
      .tickFormat(d => String(d % 24).padStart(2, '0') + ':00'));

  svgElem.append('g')
    .attr('class', 'grid')
    .attr('transform', `translate(${margin.left},0)`)
    .call(d3.axisLeft(yScale)
      .tickSize(-(width - margin.left - margin.right))
      .tickFormat(''))
    .selectAll('line')
    .attr('stroke', '#ccc')
    .attr('stroke-opacity', 0.3);

  if (!tooltip) {
    tooltip = d3.select('body')
      .append('dl')
      .attr('id', 'commit-tooltip')
      .attr('class', 'info tooltip')
      .attr('hidden', '')
      .style('position', 'fixed')
      .style('pointer-events', 'none');
    tooltip.append('dt').text('Commit');
    tooltip.append('dd').append('a').attr('id', 'commit-link').attr('target', '_blank');
    tooltip.append('dt').text('Date');
    tooltip.append('dd').attr('id', 'commit-date');
  }

  svgElem.append('g').attr('class', 'dots');
  updateScatterPlot(initialCommits); // Draw initial dots

  const brush = d3.brush()
    .extent([[margin.left, margin.top], [width - margin.right, height - margin.bottom]])
    .on('brush end', brushed);
  svgElem.call(brush);
  svgElem.selectAll('.dots, .overlay ~ *').raise();

  function brushed({ selection }) {
    const commitsInView = svgElem.select('g.dots').selectAll('circle').data();
    let selectedInBrush = [];

    if (selection) {
      const [[x0, y0], [x1, y1]] = selection;
      selectedInBrush = commitsInView.filter(d =>
        xScale(d.datetime) >= x0 && xScale(d.datetime) <= x1 &&
        yScale(d.hourFrac) >= y0 && yScale(d.hourFrac) <= y1
      );
      svgElem.selectAll('g.dots circle')
        .classed('selected', d => selectedInBrush.includes(d))
        .attr('fill-opacity', function (d) { return selectedInBrush.includes(d) ? 1 : (d3.select(this).classed('hovered') ? 1 : 0.7); });
    } else {
      svgElem.selectAll('g.dots circle')
        .classed('selected', false)
        .attr('fill-opacity', function (d) { return d3.select(this).classed('hovered') ? 1 : 0.7; });
    }

    d3.select('#scatter-plot #selection-count')
      .text(selectedInBrush.length ? `${selectedInBrush.length} commits selected` : 'No commits selected');

    const langBreakdownContainer = d3.select('#scatter-plot #language-breakdown');
    langBreakdownContainer.html('');
    if (selectedInBrush.length) {
      const lines = selectedInBrush.flatMap(d => d.lines);
      const breakdown = d3.rollup(lines, v => v.length, d => d.type);
      for (const [lang, count] of breakdown) {
        const pct = lines.length > 0 ? d3.format('.1~%')(count / lines.length) : '0%';
        langBreakdownContainer.append('dt').text(lang);
        langBreakdownContainer.append('dd').text(`${count} lines (${pct})`);
      }
    }
  }
}

function updateScatterPlot(commitsToDisplay) {
  if (!svgElem || !xScale || !yScale || !rScale) return;

  const dotsG = svgElem.select('g.dots');
  const sortedCommits = d3.sort(commitsToDisplay, (a, b) => b.totalLines - a.totalLines);

  dotsG.selectAll('circle')
    .data(sortedCommits, d => d.id)
    .join(
      enter => enter.append('circle')
        .attr('cx', d => xScale(d.datetime))
        .attr('cy', d => yScale(d.hourFrac))
        .attr('r', 0)
        .style('--r', d => rScale(d.totalLines))
        .attr('fill', 'steelblue')
        .attr('fill-opacity', 0.7)
        .on('mouseenter', showTooltip)
        .on('mousemove', showTooltip)
        .on('mouseleave', hideTooltip)
        .call(enter => enter.transition().duration(500).attr('r', d => rScale(d.totalLines))),
      update => update
        .style('--r', d => rScale(d.totalLines))
        .call(update => update.transition().duration(500)
          .attr('cx', d => xScale(d.datetime))
          .attr('cy', d => yScale(d.hourFrac))
          .attr('r', d => rScale(d.totalLines))
        ),
      exit => exit
        .call(exit => exit.transition().duration(500).attr('r', 0).remove())
    );

  if (svgElem.select('.brush').node()) {
    svgElem.select('.brush').call(d3.brush().move, null);
  }
  d3.select('#scatter-plot #selection-count').text('No commits selected');
  d3.select('#scatter-plot #language-breakdown').html('');
}


function renderLanguagePieChart(commitsForPie) {
  const pieContainer = d3.select("#language-pie-chart");
  const legendContainer = d3.select("#language-pie-legend");

  pieContainer.select("svg").remove(); // Clear previous pie chart
  legendContainer.html(""); // Clear previous legend

  if (!commitsForPie || commitsForPie.length === 0) {
    pieContainer.html("<p>No commit data for pie chart.</p>");
    return;
  }

  const lines = commitsForPie.flatMap(d => d.lines);
  if (lines.length === 0) {
    pieContainer.html("<p>No lines of code in visible commits.</p>");
    return;
  }

  const languageDataRollup = d3.rollup(lines, v => v.length, d => d.type);
  const pieChartData = Array.from(languageDataRollup, ([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  if (pieChartData.length === 0) {
    pieContainer.html("<p>No language data for pie chart.</p>");
    return;
  }

  const width = 250, height = 250, margin = 10; // Pie SVG dimensions
  const radius = Math.min(width, height) / 2 - margin;

  const svgPie = pieContainer.append("svg")
    .attr("width", width)
    .attr("height", height)
    .append("g")
    .attr("transform", `translate(${width / 2},${height / 2})`);

  const d3PieGenerator = d3.pie()
    .value(d => d.count)
    .sort(null); // Use the sort from pieChartData

  const arcGenerator = d3.arc()
    .innerRadius(0)
    .outerRadius(radius);

  const arcs = svgPie.selectAll(".arc")
    .data(d3PieGenerator(pieChartData))
    .join("g")
    .attr("class", "arc");

  arcs.append("path")
    .attr("d", arcGenerator)
    .attr("fill", d => colors(d.data.type))
    .attr("stroke", "none"); // Remove outline from pie slices

  // Populate the legend
  const legendItems = legendContainer.selectAll("li")
    .data(pieChartData)
    .join("li");

  legendItems.append("span")
    .attr("class", "swatch")
    .style("background-color", d => colors(d.type));

  legendItems.append("span")
    .attr("class", "legend-label-type")
    .text(d => d.type);

  legendItems.append("span")
    .attr("class", "legend-label-value")
    .text(d => {
      const totalLinesInPie = d3.sum(pieChartData, item => item.count);
      const percentage = totalLinesInPie > 0 ? d.count / totalLinesInPie : 0;
      return `: ${d.count} lines (${d3.format(".0%")(percentage)})`;
    });
}


function updateFileDisplay(currentFilteredCommits) {
  const filesDl = d3.select('#files-viz-container #files');
  const filesInfoCount = d3.select('#files-viz-container #files-info-count');
  const filesTypeBreakdown = d3.select('#files-viz-container #files-type-breakdown');

  if (!currentFilteredCommits || currentFilteredCommits.length === 0) {
    filesDl.html('');
    filesInfoCount.text('No commits to display files for.');
    filesTypeBreakdown.html('');
    return;
  }

  let lines = currentFilteredCommits.flatMap((d) => d.lines);
  if (!lines || lines.length === 0) {
    filesDl.html('');
    filesInfoCount.text('No line data in selected commits.');
    filesTypeBreakdown.html('');
    return;
  }

  let filesData = d3
    .groups(lines, (d) => d.file)
    .map(([name, fileLines]) => ({ name, lines: fileLines }))
    .sort((a, b) => b.lines.length - a.lines.length);

  filesInfoCount.text(`${filesData.length} files shown, ${lines.length} total lines affected.`);

  filesTypeBreakdown.html('');
  const breakdown = d3.rollup(lines, v => v.length, d => d.type);
  for (const [lang, count] of breakdown) {
    const pct = lines.length > 0 ? d3.format('.1~%')(count / lines.length) : '0%';
    filesTypeBreakdown.append('dt').text(lang);
    filesTypeBreakdown.append('dd').text(`${count} lines (${pct})`);
  }


  let filesContainer = filesDl
    .selectAll('div.file-entry')
    .data(filesData, (d) => d.name)
    .join(
      (enter) =>
        enter.append('div').attr('class', 'file-entry').call((div) => {
          div.append('dt');
          div.append('dd');
        }),
      update => update,
      exit => exit.remove()
    );

  filesContainer
    .select('dt')
    .html(d => `<code>${d.name}</code><small>${d.lines.length} lines</small>`);

  filesContainer
    .select('dd')
    .selectAll('div.loc')
    .data(d => d.lines, line => `${line.commit}-${line.file}-${line.line}`)
    .join(
      enter => enter.append('div')
        .attr('class', 'loc')
        .attr('style', d => `--color: ${colors(d.type)}`) // Use global 'colors' scale
        .style('opacity', 0) // Start transparent for fade-in
        .call(enter => enter.transition().duration(300).style('opacity', 1)),
      update => update
        .attr('style', d => `--color: ${colors(d.type)}`), // Ensure color updates
      exit => exit.transition().duration(300).style('opacity', 0).remove()
    );
}

// --- Scrollytelling Setup ---
function setupScatterScrolly() {
  const scatterStory = d3.select('#scatter-story');
  scatterStory.selectAll('.step').remove(); // Clear existing steps

  scatterStory.selectAll('.step')
    .data(allCommits)
    .join('div')
    .attr('class', 'step')
    .html((d, i) => `
      <p><strong>Commit ${i + 1}/${allCommits.length}</strong></p>
      <p>Time: <strong>${d.datetime.toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' })}</strong></p>
      <p>Commit ID: <a href="${d.url}" target="_blank">${d.id.substring(0, 7)}</a></p>
      <p>Lines changed: ${d.totalLines}</p>
      <p>Files affected: ${d3.groups(d.lines, l => l.file).length}</p>
    `);

  const scroller = scrollama();
  scroller
    .setup({
      container: '#scrolly-1',
      scroller: '#scatter-story',
      step: '#scatter-story .step',
      offset: 0.5,
      debug: false,
    })
    .onStepEnter(handleScatterStepEnter);
  window.addEventListener('resize', scroller.resize);
  if (allCommits.length > 0) { // Trigger first step if data exists
    handleScatterStepEnter({ element: scatterStory.select('.step').node(), index: 0, direction: 'down' });
  }
}

function handleScatterStepEnter(response) {
  d3.selectAll('#scatter-story .step').classed('is-active', false);
  d3.select(response.element).classed('is-active', true);

  const currentCommitData = response.element.__data__;
  if (!currentCommitData || !currentCommitData.datetime) return;
  const currentCommitDatetime = currentCommitData.datetime;

  const commitsForPlot = allCommits.filter(commit => commit.datetime <= currentCommitDatetime);
  const rawDataForInfo = allData.filter(line =>
    commitsForPlot.some(commit => commit.id === line.commit)
  );

  updateScatterPlot(commitsForPlot);
  renderCommitInfo(rawDataForInfo, commitsForPlot); // General summary based on scatter plot's progress
  renderLanguagePieChart(commitsForPlot); // Update language pie chart
}

function setupFilesScrolly() {
  const filesStory = d3.select('#files-story');
  filesStory.selectAll('.step').remove(); // Clear existing steps

  filesStory.selectAll('.step')
    .data(allCommits) // Use allCommits for consistent steps
    .join('div')
    .attr('class', 'step')
    .html((d, i) => `
      <p><strong>Timeline: Commit ${i + 1}</strong></p>
      <p>By <strong>${d.datetime.toLocaleDateString('en', { dateStyle: 'long' })}</strong>, the following files had been modified up to this point in the project's history.</p>
      <p>This specific commit (<a href="${d.url}" target="_blank">${d.id.substring(0, 7)}</a>) involved changes to ${d.totalLines} lines across ${d3.groups(d.lines, l => l.file).length} files.</p>
      <p>Key types of files in this commit: ${[...new Set(d.lines.map(l => l.type))].join(", ")}.</p>
    `);

  const filesScroller = scrollama();
  filesScroller
    .setup({
      container: '#scrolly-files',
      scroller: '#files-story',
      step: '#files-story .step',
      offset: 0.5,
      debug: false,
    })
    .onStepEnter(handleFilesStepEnter);
  window.addEventListener('resize', filesScroller.resize);
  if (allCommits.length > 0) { // Trigger first step if data exists
    handleFilesStepEnter({ element: filesStory.select('.step').node(), index: 0, direction: 'down' });
  }
}

function handleFilesStepEnter(response) {
  d3.selectAll('#files-story .step').classed('is-active', false);
  d3.select(response.element).classed('is-active', true);

  const currentCommitData = response.element.__data__;
  if (!currentCommitData || !currentCommitData.datetime) return;
  const currentCommitDatetime = currentCommitData.datetime;

  const commitsForFileViz = allCommits.filter(commit => commit.datetime <= currentCommitDatetime);
  updateFileDisplay(commitsForFileViz);
}


// --- Main Execution Logic ---
(async () => {
  allData = await loadData();
  allCommits = processCommits(allData);

  // Define colors scale with a domain of all unique types for consistency
  const allLanguageTypes = [...new Set(allData.map(d => d.type))].sort();
  colors = d3.scaleOrdinal(d3.schemeTableau10).domain(allLanguageTypes);


  // Initial render with all data for summary, and first step for visualizations
  renderCommitInfo(allData, allCommits); // Overall summary
  const initialVisibleCommits = allCommits.length > 0 ? [allCommits[0]] : [];
  renderScatterPlot(initialVisibleCommits);
  renderLanguagePieChart(initialVisibleCommits); // Initial pie chart
  updateFileDisplay(initialVisibleCommits);

  setupScatterScrolly();
  setupFilesScrolly();

})();