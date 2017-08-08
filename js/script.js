
(function(){
    'use strict'

    var publications_dir = '/pubs'
    var max_abtract_len = 120
    var search_box_id = 'search_box'
    var summary_tag_class = 'summary-tag'


    // Utils.

    var truncate_abstract_string = function(s) {
        return s.length > max_abtract_len ? `${s.slice(0,max_abtract_len)}…` : s
    }

    var addMultiEventsListener = function(element, events, listner) {
        events.split(' ').forEach(evt => element.addEventListener(evt, listner))
    }

    var fetch_document = function(address, callback) {
        var httpRequest = new XMLHttpRequest()
        httpRequest.onreadystatechange = function() {
            if (httpRequest.readyState === XMLHttpRequest.DONE) {
                if (httpRequest.status === 200) {
                    callback(httpRequest.responseText, null)
                } else {
                    // There was a problem with the request.
                    // For example, the response may have a 404 (Not Found)
                    // or 500 (Internal Server Error) response code.
                }

            }
        }
        httpRequest.open('GET', address, true)
        httpRequest.send()
    }

    var meta_to_filename = function(title, uuid) {
        var name = title.trim().toLowerCase().replace(/'*/g,'').replace(/\s+/g,'-').replace('ö','o')
        var id = uuid.slice(0,uuid.indexOf('-'))
        return `${name}-${id}`
    }


    var escape_regex = function(s) {
        return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
    }

    var parse_query_string = function(str) {

        // str ~ /search?tags=tag1,tag2&words=w1,w2
        return Object.assign(
            { 'cmd': 'search' },
            ...str.slice(str.indexOf('?')+1)
                .split('&')
                .map((s)=>s.split('='))
                .map(function(kv) {
                    var k = kv[0], obj = {}; obj[k] = kv[1].split(',').filter((s) => s !== ''); return obj
                })
        )
    }
    var strict_equal = (a,b) => a === b
    var check_query = (query) => typeof query === 'object'
    var summary_equal = (s1,s2) => strict_equal(s1.version,s2.version)
    var summaries_equal = function(s1,s2) {
        if (s1.length !== s2.length) { return false }
        s1.forEach(function(s1s) { if (! s2.some((s2s) => summary_equal(s1s,s2s))) { return false } })
        return true
    }
    var type_error = function(msg) { throw new TypeError(msg) }

    var check_form = function(value, form) {
        if (form === Boolean) {
            typeof value === 'boolean' || type_error(`expected type: ${form}, got: ${value}.`)
        }
        else if (form === String) {
            typeof value === 'string' || type_error(`expected type: ${form}, got: ${value}.`)
        }
        else if (Array.isArray(form)) {
            form.length === 1 || type_error(`form should be like [form'] not: ${form}.`)
            value.forEach(function(value) { check_form(value,form[0]) })
        }
        else if (typeof form === 'object') {
            var form_keys = Object.keys(form)
            form_keys.length === Object.keys(value).length || type_error('form_keys and value_keys length should be equal.')
            form_keys.forEach(function(key) { check_form(value[key],form[key]) })
        }
        return true
    }
    var summaries_to_html = (function() {
        var template = function(summaries) {
            return `
<div cass="list_of_summaries">
  ${summaries}
</div>
`
        }
        return function(summaries, summary_to_html) {
            return template(summaries.map(summary_to_html).reduce((summaries_html, summary_html) => summaries_html.concat(summary_html) + '\n', ''))
        }
    }())

    // Node value initialized at compute(params)
    // Node listen to other nodes value with: other_node.subscribe(node(key)) where key in params.
    //   When other_node value is updated, params[key] = value and this node value is recomputed.
    //   If a new value is found, then it's told to all subscribed nodes.
    var Node = function(params, compute, equal) {
        var memory = undefined, value = undefined, observers = []
        var remember = function(obj) { return Object.assign({}, obj) }
        var process = function(memory) {
            for (var prop in memory) { if (memory.hasOwnProperty(prop)) { if (memory[prop] === undefined) { return undefined } } }
            return compute(memory)
        }
        var update = function(value, new_memory) {
            var new_value = process(new_memory)
            if (new_value !== undefined && (value === undefined || !equal(value, new_value))) {
                observers.forEach(next => next(new_value))
                return new_value
            }
            return value
        }
        var next = function(selector) {
            return function(v) {
                Object.keys(memory).includes(selector) || type_error(`selector: ${selector} belong to ${Object.keys(memory)}.`)
                memory[selector] = v
                value = update(value, memory)
            }
        }

        var re_init = function(params) {
            memory = remember(params)
            value = undefined
            value = update(value, memory)
        }

        re_init(params)

        return {
            subscribe: function(next) {
                observers.push(next)
                value !== undefined && next(value)
            },
            next,
            re_init
        }
    }


    var summary_to_html = (function() {
        var template = function({
            broadcast,
            title,
            tags,
            abstract,
            id,
            version,
            date,
            last_update,
            author,
            sign,
            img,
            img_credits,
            to_pdf,
            css,
            email
        }) {

            var address = `${publications_dir}/${meta_to_filename(title,id)}.html`


            return `
<div class="summary">
    <div class="summary-columns">
        <div class="summary-picture-column">
            <a href="${address}" title="${img_credits}" style="background-image: url(/images/summary-${img});background-position: center center;"></a>
        </div>
        <div class="summary-text-column">
            <a href="${address}"><h1 class="summary-title">${title}</h1></a>
            <p class="summary-abstract">${truncate_abstract_string(abstract)}</p>
            <p class="summary-author_date"><a href="mailto:${email}">Author: ${author}</a>. Last update: ${last_update}.</p>
            <ul class="summary-tags">
                <li class="${summary_tag_class}">tags:</li>
                ${tags.map((tag) => '<li class="'+summary_tag_class+'"><a>'+tag+'</a></li>\n').join('')}
            </ul>
        </div>
    </div>
</div>
`

        }
        return function(summary) {
            check_summary(summary)
            return template(summary)
        }
    }())



    // Types.

    var check_summary = (function() {
        var summary_form = {
            'broadcast': Boolean,
            'title': String,
            'tags': [String],
            'abstract': String,
            'id': String,
            'version': String,
            'date': String,
            'last_update': String,
            'author': String,
            'sign': String,
            'img': String,
            'img_credits': String,
            'to_pdf': Boolean,
            'css': String,
            'email': String,
            'link-citations': Boolean
        }

        return function(summary) { check_form(summary, summary_form) }
    }())
    var check_search_string = function(search_string) { check_form(search_string, 'string') || type_error(`search_string value should have type: 'string', but has type: ${typeof search_string}.`)}


    // Node initializations.
    var init_page = (function() {
        return function() {
            return  document.getElementsByTagName('html')[0]
        }
    }())

    var init_summaries = function() {

        var node = Node(
            { summaries: [] },
            function({ summaries }) {
                summaries.forEach(check_summary)
                return summaries.sort((s1,s2) => (new Date(s2.last_update)).getTime() - (new Date(s1.last_update)).getTime())
            },
            summaries_equal
        )

        fetch_document(
            `${publications_dir}/summaries.json`,
            function(doc, err) {
                if (doc) {
                    node.re_init({ summaries: JSON.parse(doc) })
                }
            }
        )

        return node
    }
    var init_search_string = function() {
        var search_box = document.getElementById(search_box_id)
        var node = Node(
            { search_string: search_box.value },
            function({ search_string }) {
                check_search_string(search_string)
                var tags = ''
                var words = ''
                search_string
                    .trim()
                    .replace(/\s+/,' ')
                    .split(' ')
                    .forEach(
                        function(s) {
                            var res_tag = /tag:(.+)/.exec(s)
                            var res_word = /(.+)/.exec(s)
                            if (res_tag) {
                                tags = tags + res_tag[1] + ','
                            }
                            else if (res_word) {
                                words = words + res_word[1] + ','
                            }
                        }
                    )
                if (tags.length > 5) { tags = tags.slice(0,-1) }
                if (words.length > 6) { words = words.slice(0,-1) }
                return `/search?tags=${tags}&words=${words}`
            },
            strict_equal
        )
        search_box.addEventListener('input', function(evt) {
            node.re_init({ search_string: evt.target.value })
        })

        return node
    }
    var init_query = function(search_string) {
        var node = Node({ query_string: '/search?tags=&words=' }, function({ query_string }) { return parse_query_string(query_string) }, strict_equal)

        search_string.subscribe(node.next('query_string'))

        return node
    }
    var init_filtered_summaries = function(summaries, query) {
        var node = Node(
            { summaries: [], query: { cmd: 'search', tags: [], words: [] } },
            function({ summaries, query }) {
                summaries.forEach(check_summary)
                check_query(query)
                var tags = query.tags
                var words = query.words
                if (query.tags.length > 0 || query.words.length > 0) {
                    return summaries
                        .filter(function(sum) { return tags.map(function(tag) { return sum.tags.includes(tag) }).reduce(function(a,b) { return a && b }, true) })
                        .filter(function(sum) {
                            return words.map(function(word) {
                                return (new RegExp(escape_regex(word),'i')).test(JSON.stringify(sum)) }).reduce(function(a,b) { return a && b }, true) })
                }
                else {
                    return summaries
                }

            },
            summaries_equal
        )
        summaries.subscribe(node.next('summaries'))
        query.subscribe(node.next('query'))
        return node
    }
    var init_filtered_summaries_html = function(summaries) {
        var node = Node(
            { summaries: [] },
            function({ summaries }) {
                summaries.forEach(check_summary)
                return summaries_to_html(summaries, summary_to_html)
            },
            strict_equal
        )
        summaries.subscribe(node.next('summaries'))
        return node
    }



    var init_ui = function(page, filtered_summaries_html) {
        var node = Node(
            { filtered_summaries_html: '' },
            function({ filtered_summaries_html }) {
                check_form(filtered_summaries_html, 'string')

                page.getElementsByClassName('content')[0].innerHTML = filtered_summaries_html

                var search_box = document.getElementById(search_box_id)
                Array.
                    prototype.
                    slice.
                    call(document.getElementsByClassName(summary_tag_class)).
                    forEach(function(tag) {
                        tag.addEventListener(
                            'click',
                            function(evt) {
                                search_box.value = `${search_box.value} tag:${evt.target.text}`
                                search_box.dispatchEvent(new Event('input'))
                            }
                        )
                    })

                return undefined
            },
            () => true
        )
        filtered_summaries_html.subscribe(node.next('filtered_summaries_html'))
        return node
    }


    // Build network.
    var summaries = init_summaries()
    var search_string = init_search_string()
    var page = init_page()
    var query = init_query(search_string)
    var filtered_summaries = init_filtered_summaries(summaries, query)
    var filtered_summaries_html = init_filtered_summaries_html(filtered_summaries)
    var ui = init_ui(page, filtered_summaries_html)

}())
