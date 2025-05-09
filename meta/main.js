import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

async function loadData() {
  return d3.csv('loc.csv', row => ({
    ...row,
    line:   +row.line,
    depth:  +row.depth,
    length: +row.length,
    datetime: new Date(row.datetime),
    date:     new Date(row.date + 'T00:00' + row.timezone),
  }));
}

function processCommits(data) {
  return d3.groups(data, d => d.commit)
    .map(([id, lines]) => {
      const first = lines[0];
      const dt    = first.datetime;
      const commit = {
        id,
        url:        `https://github.com/sophia-vo/portfolio/commit/${id}`,
        author:     first.author,
        datetime:   dt,
        hourFrac:   dt.getHours() + dt.getMinutes()/60,
        totalLines: lines.length
      };
      Object.defineProperty(commit, 'lines', {
        value: lines,
        enumerable: false,  
      });
      return commit;
    });
}

function renderCommitInfo(data, commits) {
    
    const stats = d3.select('#stats').html('')
      .append('dl')
      .attr('class','stats');
  
    stats.append('dt').text('Commits');
    stats.append('dd').text(commits.length);
  
    const numFiles = d3.groups(data, d => d.file).length;
    stats.append('dt').text('Files');
    stats.append('dd').text(numFiles);
  
    stats.append('dt').html('Total LOC');
    stats.append('dd').text(data.length);
  
    const maxDepth = d3.max(data, d => d.depth);
    stats.append('dt').text('Max Depth');
    stats.append('dd').text(maxDepth);
  
    const longestLine = d3.max(data, d => d.length);
    stats.append('dt').text('Longest Line');
    stats.append('dd').text(longestLine);
  
    const maxLines = d3.max(commits, d => d.totalLines);
    stats.append('dt').text('Max Lines');
    stats.append('dd').text(maxLines);
  }
  

function renderScatterPlot(commits) {
  const width  = 1000, height = 600;
  const margin = {top:10,right:10,bottom:30,left:40};
  const svg = d3.select('#chart')
    .append('svg')
    .attr('viewBox', [0,0,width,height])
    .style('overflow','visible');

  // scales
  const x = d3.scaleTime()
    .domain(d3.extent(commits, d=>d.datetime))
    .range([margin.left, width - margin.right])
    .nice();
  const y = d3.scaleLinear()
    .domain([0,24])
    .range([height - margin.bottom, margin.top]);
  const [minL, maxL] = d3.extent(commits, d=>d.totalLines);
  const r = d3.scaleSqrt()
    .domain([minL, maxL])
    .range([5, 19]);

  // axes
  svg.append('g')
    .attr('transform', `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(width/100).tickSizeOuter(0));
  svg.append('g')
    .attr('transform', `translate(${margin.left},0)`)
    .call(d3.axisLeft(y)
      .tickFormat(d=>String(d%24).padStart(2,'0')+':00'));

  // grid lines
  svg.append('g')
    .attr('class','grid')
    .attr('transform',`translate(${margin.left},0)`)
    .call(d3.axisLeft(y)
      .tickSize(-(width - margin.left - margin.right))
      .tickFormat(''))
    .selectAll('line')
      .attr('stroke','#ccc')
      .attr('stroke-opacity',0.3);

  // tooltip setup
  const tooltip = d3.select('body')
    .append('dl')
      .attr('id','commit-tooltip')
      .attr('class','info tooltip')
      .attr('hidden','')
      .style('position','fixed')
      .style('pointer-events','none');

  tooltip.append('dt').text('Commit');
  tooltip.append('dd')
    .append('a')
      .attr('id','commit-link')
      .attr('target','_blank');
  tooltip.append('dt').text('Date');
  tooltip.append('dd').attr('id','commit-date');

  function showTooltip(event,d) {
    d3.select('#commit-link')
      .attr('href', d.url)
      .text(d.id);
    d3.select('#commit-date')
      .text(d.datetime.toLocaleString('en',{dateStyle:'full', timeStyle:'short'}));
    tooltip
      .style('left', event.clientX + 10 + 'px')
      .style('top',  event.clientY + 10 + 'px')
      .attr('hidden', null);
  }
  function hideTooltip() {
    tooltip.attr('hidden','');
  }

  // draw dots
  const dots = svg.append('g')
    .attr('class','dots')
    .selectAll('circle')
    .data(commits.sort((a,b)=>b.totalLines-a.totalLines))  // small on top
    .join('circle')
      .attr('cx', d=>x(d.datetime))
      .attr('cy', d=>y(d.hourFrac))
      .attr('r',  d=>r(d.totalLines))
      .attr('fill','steelblue')
      .attr('fill-opacity',0.7)
      .on('mouseenter', (e,d)=>{ showTooltip(e,d); d3.select(e.currentTarget).attr('fill-opacity',1); })
      .on('mousemove',  (e,d)=> showTooltip(e,d))
      .on('mouseleave', (e,d)=>{ hideTooltip(); d3.select(e.currentTarget).attr('fill-opacity',0.7); });

  // brushing
  const brush = d3.brush()
    .extent([[margin.left,margin.top],[width-margin.right,height-margin.bottom]])
    .on('brush end', brushed);

  svg.call(brush);
  
  svg.selectAll('.dots, .overlay ~ *').raise();

  function brushed({selection}) {
    const [ [x0,y0], [x1,y1] ] = selection || [];
    const selected = commits.filter(d =>
      !selection ? false
      : x(d.datetime) >= x0 && x(d.datetime) <= x1
      && y(d.hourFrac)   >= y0 && y(d.hourFrac)   <= y1
    );
    svg.selectAll('circle')
      .classed('selected', d=> selection && selected.includes(d));
    d3.select('#selection-count')
      .text(selected.length
        ? `${selected.length} commits selected`
        : 'No commits selected');
    
    // language breakdown
    const container = d3.select('#language-breakdown');
    container.html('');
    if (selected.length) {
      const lines = selected.flatMap(d=>d.lines);
      const breakdown = d3.rollup(lines, v=>v.length, d=>d.type);
      for (const [lang, count] of breakdown) {
        const pct  = d3.format('.1~%')(count / lines.length);
        container.append('dt').text(lang);
        container.append('dd').text(`${count} lines (${pct})`);
      }
    }
  }
}

(async () => {
  const data    = await loadData();
  const commits = processCommits(data);
  renderCommitInfo(data, commits);
  renderScatterPlot(commits);
})();
