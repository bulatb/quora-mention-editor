/**
 * A bookmarklet for editing mentions on Quora. Put your cursor in the mention 
 * text, click this in your bookmarks bar, and type your new text in the prompt.
 *
 * Support: Firefox 10+, Chrome 17+.
 * Note: IE9+, latest Safari, and older Chrome and Firefox are most likely fine,
 * but contentEditable behavior is too inconsistent across browsers for me to 
 * support every little thing for all of them. This strategy seems to mirror 
 * Quora's own, so I think it makes sense for bookmarklets too.
 *
 * By the way, Chrome wins the prize for best-behaving contentEditable blocks.
 * Thanks, Google. :)
 *
 * Homepage: http://bochkariov.com/quora/edit-mentions
 * Source:   http://github.com/bulatb/quora-mention-editor
 * Me:       http://quora.com/Bulat-Bochkariov
 */
(function() {
    /**
     * Version number, used to check for updates.
     */
    var version = '1.1',
    
        /**
         * Where to check for updates.
         */
        updateUrl = 'http://bochkariov.com/quora/edit-mentions/update?version=' + version,
        
        /**
         * Where to report bugs.
         */
        issuesUrl = 'http://bochkariov.com/quora/edit-mentions/bugs?version=' + version,
        
        /**
         * CSS-like format for styling the prompt. Transformed to 
         * namespaced CSS by the toCss() function.
         */
        styles = {
            arrowNub: {
                'background-position': '10px top'
            },
            prompt: {
                background: '#fff',
                padding: '11px',
                width: 'auto'
            },
            inputField: {
                background: '#f9f9f9',
                border: '1px solid #ccc',
                display: 'block',
                padding: '2px'
            },
            controls: {
                margin: '2px 0 0 0',
                overflow: 'auto',
                padding: '6px 4px 0 0'
            },
                'controls a:last-child': {
                    color: '#777',
                    'float': 'right'
                },
                'controls:hover a:last-child': {
                    display: 'inline',
                },
                'controls:hover a:last-child:hover': {
                    color: '#19558D',
                    'text-decoration': 'none'
                },
                'controls a:focus': {
                    border: '0',
                    outline: 'none'
                },
            help: {
                display: 'none',
                margin: '0',
                padding: '6px 4px 0 0'
            },
                'help a': {
                    color: '#777',
                    'font-size': '0.97em',
                },
            okButton: {
                display: 'block',
                'float': 'left',
                margin: '-1px 10px 0 0',
                'min-width': '0',
                padding: '2px 10px'
            },
            cancelButton: {
                'font-size': '0.97em',
                'text-decoration': 'underline'
            },
            '.hidden': {
                display: 'none'
            }
        },
        focusedText = document.getSelection().focusNode,
        focusedLink = getFocusedLink(focusedText),
        originalText = focusedLink.text();
        
        if (focusedLink.length !== 0) {
            /* If something weird went down and an unexpected type of node was 
             * selected, the check above will fail and nothing will happen. See 
             * getFocusedLink() for details.
             *
             * Because the prompt steals focus from the rich-text editor, this 
             * also doubles as a way to make the whole thing idempotent
             * without keeping any extra global state.
             */
            tooltipPrompt(
                focusedLink,
                function(link, promptResult) {
                    link.text(promptResult);
                },
                function(link) {
                    link.text(originalText);
                },
                function(link, currentText) {
                    link.text(currentText);
                }
            );
        }

    /**
     * Converts a CSS-like styling object to a string of namespaced CSS. This 
     * version has been stripped down for performance and supports only the 
     * most basic target strings. See goodies.js for a much more powerful 
     * version that supports anything allowed by CSS.
     *
     * Styling object format: {
     *     selector: {
     *         property: 'value',
     *         ...
     *     },
     *     ...
     * };
     *
     * Selectors are transformed as follows:
     *
     *     'top descendant > child' -> '#{namespace}top descendant > child'
     *     'top #id.class:pseudo'   -> '#{namespace}top #id.class:pseduo'
     *     '.top > child[prop=val]  -> '.{namespace}top > child[prop=val]'
     *     '#note .this .case'      -> '#{namespace}#note .this .case'
     *
     * ...and so on. Any selector that doesn't start with a dot is assumed to 
     * select by ID and given a leading hash. Interior dots and hashes are NOT 
     * replaced with namespaced equivalents, so this function won't help when 
     * namespaced elements need to reference each other.
     *
     * Most importantly: If you decide to borrow this function, be extra careful
     * when using classes in rules that start with a namespaced ID.  A selector 
     * like "#my_ns_widget .class" may not itself apply to anything outside 
     * your widget, but that doesn't mean your .class{} rule won't clobber 
     * some global CSS.
     */
    function toCss(styles, namespace) {
        var css = '',
            ruleBody;
        
        for (var selector in styles) {
            if (styles.hasOwnProperty(selector)) {
                ruleBody = styles[selector];
                
                if (selector.charAt(0) === '.') {
                    css += selector.replace('.', '.' + namespace) + '{';
                }
                else {
                    css += '#' + namespace + selector + '{';
                }
                
                for (var property in ruleBody) {
                    if (ruleBody.hasOwnProperty(property)) {
                        css += property + ':' + ruleBody[property] + ';';
                    }
                }
                
                css += '}';
            }
        }

        return css;
    }
    
    /**
     * Puts the cursor (caret) at the end of a contentEditable element inside 
     * Quora's rich-text editor. Requires browser support for text ranges and 
     * window.getSelection().
     */
    function cursorToEnd(element) {
        var selection,
            range = document.createRange(),
            /* Behavior fix for Firefox. See below. */
            magicEndpieceNode = document.createTextNode('');
        
        element.closest('.qtext_editor_content').focus();
        selection = window.getSelection();
        
        if (selection.rangeCount > 0) {
            selection.removeAllRanges();
        }
        
        /* In Firefox, if the cursor is placed at the end of the mention link, 
         * anything the user types after it becomes part of the link text. To 
         * get around that quirk, follow the link with a dummy text node and 
         * put the cursor at the beginning of that. */
        $(magicEndpieceNode).insertAfter(element);
        
        range.selectNodeContents(magicEndpieceNode);
        range.collapse(true);
        selection.addRange(range);
    }

    /**
     * Things I came to hate while writing this function:
     *  - FocusNode detection
     *  - ContentEditable
     *  - Various browser behaviors
     *  - Browsers
     *  - This function
     *  - Every single other thing
     *
     *  - Even puppies
     *
     * It takes an arbitrary DOM node and tries to determine if it could be part
     * of a focused mention in Quora's rich-text editor. On success, it returns
     * the mention link wrapped in jQuery; otherwise returns an empty
     * collection. See body comments for details.
     *
     * The relatively nice form you see now (and the existence of this function 
     * itself) is the result of more than a little bit of trial, error, Firebug,
     * error, Google, and error.
     *
     * Known issues:
     *  1. Also works on non-contentEditable elements. I don't really want to
     *     fix this because the results are pretty funny (but harmless).
     *
     *  2. Assumes the selection didn't move between focusedNode being set and
     *     the function being called. Not a hard fix, but the assumption holds 
     *     for this bookmarklet anyway.
     *
     *  3. There might be a weird case where two links are adjacent and the user
     *     clicks right between them, but if that happens then it's not even 
     *     clear which one they wanted. The highlight will tell them which one 
     *     they;re editing, so they can always just cancel and find a better 
     *     place to click.
     */
    function getFocusedLink(focusedNode) {
        function cursorAtLeftEdge() {
            var cursorAtEdge = currentRange.endOffset === currentRange.endContainer.length,
                nextNodeIsLink = $(currentRange.endContainer.nextSibling).is('a');
            
            return cursorAtEdge && nextNodeIsLink;
        }
        
        function cursorAtRightEdge() {
            var cursorAtEdge = currentRange.startOffset === 0,
                /* For some reason, $(...startContainer).prev() fails here. */
                prevNodeIsLink = $(currentRange.startContainer.previousSibling).is('a');

            return cursorAtEdge && prevNodeIsLink;
        }
        
        var wrappedNode = $(focusedNode),
            lowestParentLink = wrappedNode.closest('a'),
            currentRange = window.getSelection().getRangeAt(0);
        
        if (focusedNode.nodeType === 3) {
            if (lowestParentLink.length === 0) {
                /* Not a text node inside a link. Is the cursor at the end
                 * of the the link's preceeding text node, or the start of the
                 * following node? */

                if (cursorAtLeftEdge()) {
                    /* Yes. Grab the next node instead. */
                    return getFocusedLink(currentRange.endContainer.nextSibling);
                }
                else if (cursorAtRightEdge()) {
                    /* Part 2 of the Firefox fix from cursorToEnd().
                     * Grab the previous node instead. */
                    return getFocusedLink(currentRange.startContainer.previousSibling);
                }
                else {
                    /* No. Return a blank collection and do nothing. */
                    return new jQuery.fn.init();
                }
            }
            else {
                /* Focused node is a text node inside a link. */
                return lowestParentLink;
            }
        }
        else if (wrappedNode.is('a')) {
            /* Focused node is a link. */
            return wrappedNode;
        }
        
        /* Here's where a fix for the Firefox focus-to-container problem might 
         * go. I'm hoping this is a bug in Quora's mention builder, which would 
         * be nice because then /my/ issue would be much more fixable. As much 
         * as I hate to leave a UX problem open, I don't see what I can do 
         * about it now.
         */
         
        else {
            /* Some other kind of node is focused. Just ignore it. */
            return new jQuery.fn.init();
        }
    }
    
    /**
     * HTML for the tooltip, salted with a namespace to avoid collisions with
     * Quora.
     *
     * If you like benchmarks, you might want to see this:
     *
     *   http://jsperf.com/mention-editor-html-templating
     *
     * Turns out the oft-touted .split().join() is relatively butt-slow. And 
     * yeah, this could be twice as fast if I used %ns% everywhere.
     */
    function tooltipHtml(namespace) {
        return (
            '<div class="hover_menu">' +
                '<div id="arrowNub" class="hover_menu_nub"></div>' +
                '<div id="prompt" class="menu_contents growl_notification">' +
                    '<input id="inputField" type="text" />' +
                    '<div id="controls">' +
                        '<a id="okButton" href="#" class="submit_button">Save</a>' +
                        '<a id="cancelButton" href="#" title="Undo changes and close">Cancel</a>' +
                        '<a id="helpToggle" class="%ns%hidden" href="#">+</a>' +
                    '</div>' +
                    '<div id="help">' +
                        '<a href="' + updateUrl + '" title="You have version ' + version + '" target="_%ns%_update">Check for updates</a>' +
                        '<br/><a href="' + issuesUrl + '" target="_%ns%_issues">Report bug</a>' +
                    '</div>' +
                '</div>' +
            '</div>'
        ).replace(/id="/g, 'id="' + namespace).replace(/%ns%/g, namespace);
    }
    
    /**
     * Creates and places a (mostly) generic tooltip prompt with a text field,
     * Ok/Cancel buttons, and some bookmarklet-specific UI that it's kind of
     * silly to factor out.
     *
     * Parameters:
     * target   - A jQuery-wrapped DOM node for the function to work on. In this
     *            case it's assumed to be a link.
     *
     * onOk     - When the Ok button is clicked, this function is called with 
     *            two arguments:
     *                onOk(target, input_field_value)
     *
     * onCancel - Just like onOk.
     *
     * onKeyUp  - Optional. When the input field sees a keyUp event, this
     *            function (if given) is called with two arguments:
     *                onKeyUp(target, input_field_value)
     *
     * Returns the finished tooltip, wrapped in jQuery.
     */
    function tooltipPrompt(target, onOk, onCancel, onKeyUp) {
        /**
         * Builds a namespaced ID from the given string. Used for selecting 
         * things with jQuery.
         */
        function id(semanticId) {
            return '#' + namespace + semanticId;
        }
        
        /**
         * Just what it sounds like.
         */
        function placeTooltip() {
            var targetOffset = target.offset();
            
            tooltip.css({
                position: 'absolute',
                top: targetOffset.top + target.outerHeight() + 2,
                left: targetOffset.left
            });
        }
        
        /**
         * Destroys the tooltip, cleans up event handlers, and returns focus
         * to the editor.
         */
        function cleanUp() {
            tooltip.fadeOut('fast', function() {                
                tooltip.remove();
                $(id('style')).remove();
                target.css({background: '#fff'});

                cursorToEnd(target);
            });
            
            editorCancelButton.unbind('.' + namespace);
            target.closest('.qtext_editor_content').unbind('.' + namespace);
        }
        
        var namespace = 'qp_' + (+new Date()) + '__',
            tooltip = $(tooltipHtml(namespace)),
            inputField = tooltip.find('input'),
            okButton,
            cancelButton,
            editorCancelButton,
            helpToggle;
        
        /* Add the tooltip before its behavior so everything looks fast.
         * But this is a dirty lie. Everything is not fast. */
        
        $('head').append(
            $('<style type="text/css">' + toCss(styles, namespace) + '</style>', {id: namespace + 'style'})
        );
        
        target.css({background: '#ffff80'});
        
        placeTooltip();
        tooltip.appendTo('body');
        inputField.val(target.text()).select();
        
        /* Now let's get down to business (to defeat the DOM). */

        okButton = tooltip.find('.menu_contents').find('a').first();
        cancelButton = okButton.next();
        editorCancelButton = target.closest('.inline_editor_form').find('.inline_editor_cancel_button');
        helpToggle = tooltip.find(id('helpToggle'));
        
        /* Behavior */
        
        inputField.keyup(function(e) {
            if (e.which === 13) {
                /* Enter key */
                onOk(target, inputField.val());
                cleanUp();
            }
            else if (e.which === 27) {
                /* Escape key */
                onCancel(target, inputField.val());
                cleanUp();
            }
            else {
                /* Because onKeyUp is optional. */
                typeof onKeyUp === 'function' && onKeyUp(target, inputField.val());
            }
        });
        
        okButton.click(function() {
            onOk(target, inputField.val());
            cleanUp();
            
            return false;
        });
        
        cancelButton.click(function() {
            onCancel(target);
            cleanUp();
            
            return false;
        });
        
        /**
         * Make sure the tooltip goes away if they close the editor--but only 
         * this editor, not another one they might open later.
         */
        editorCancelButton.bind('click.' + namespace, function() {
            onCancel(target);
            cleanUp();
        });
        
        target.closest('.qtext_editor_content').bind(
            /* Make sure the tooltip moves if the mention does */
            'keyup.' + namespace, placeTooltip
        ).bind(
            /**
             * While the prompt is open, make sure they can't edit the mention 
             * from the rich-text editor. Any other text is fair game.
             */
            'keydown.' + namespace, function() {
                var focusedNode = document.getSelection().focusNode,
                    targetIsNode = target.length !== 0;
                
                if (targetIsNode && getFocusedLink(focusedNode).get(0) === target.get(0)) {
                    return false;
                }
            }
        );
        
        /* Behavior for the (+) menu */
        
        helpToggle.toggle(
            function() {
                $(id('help')).slideDown('fast');
                $(this).text('\u00d7').removeClass(namespace + 'hidden');
                
                return false;
            },
            function() {
                $(id('help')).slideUp('fast');
                $(this).text('+').addClass(namespace + 'hidden');
                
                return false;
            }
        );
        
        return tooltip;
    }
})();

/* :) */